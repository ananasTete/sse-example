"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UseEditorAgentReturn } from "../types";
import {
  agentChatKeys,
  fetchAgentChatSession,
  upsertAgentChatSessionList,
  useAgentChatCompletion,
  useAgentChatSessionQuery,
  useAgentDraftSession,
  useAgentResumeChatCompletion,
} from "../chat/hooks";
import { ContextBar } from "./context-bar";
import { AgentChatHistoryPopover } from "../chat/components/agent-chat-history-popover";
import { AgentChatMessageList } from "../chat/components/agent-chat-message-list";
import { AgentChatPromptInput } from "../chat/components/agent-chat-prompt-input";
import type { AgentChatState } from "../chat/types";
import { useApplyAgentEdits } from "../hooks/use-apply-agent-edits";

// ============================================================
// Constants
// ============================================================

/** 文档来源 ID，用于 completion origin 和 at_references */
const DOCUMENT_ID = "agent-editor-document";

// ============================================================
// Helpers
// ============================================================

function getSessionTitle(title: string | null | undefined) {
  return title?.trim() || "新会话";
}

// ============================================================
// Types
// ============================================================

interface AgentChatProps {
  editorAgent: UseEditorAgentReturn;
}

export interface AgentChatHandle {
  submitFromSelectionPanel: (prompt: string) => boolean;
}

// ============================================================
// Component
// ============================================================

export const AgentChat = forwardRef<AgentChatHandle, AgentChatProps>(
  function AgentChat(props, ref) {
    const queryClient = useQueryClient();
    const submitLockRef = useRef(false);
    const resumeKeyRef = useRef<string | null>(null);
    const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
    const [panelError, setPanelError] = useState<string | null>(null);

    const {
      consume: consumeDraftSession,
      isLoading: isDraftSessionLoading,
      isFetching: isDraftSessionFetching,
    } = useAgentDraftSession();

    const sessionQuery = useAgentChatSessionQuery(activeChatSessionId);
    const { mutateAsync: createCompletion, isPending: isSending } = useAgentChatCompletion();
    const { mutate: resumeCompletion, isPending: isResuming } = useAgentResumeChatCompletion();

    const chatState = sessionQuery.data;
    const messages = chatState?.chat_messages ?? [];
    const activeAssistantMessage = messages.findLast(
      (message) => message.role === "ASSISTANT" && message.status === "WIP",
    );
    const isStreaming = isSending || isResuming;
    const isPreparingDraft = isDraftSessionLoading || isDraftSessionFetching;

    // ================================================================
    // 自动 resume 中断的流
    // ================================================================

    useEffect(() => {
      resumeKeyRef.current = null;
    }, [activeChatSessionId]);

    useEffect(() => {
      if (!activeChatSessionId || !sessionQuery.isSuccess || !chatState) return;
      if (!activeAssistantMessage) return;

      // 用 sessionId + messageId 做去重，确保同一条 WIP 消息只 resume 一次
      const resumeKey = `${activeChatSessionId}:${activeAssistantMessage.message_id}`;
      if (resumeKeyRef.current === resumeKey) return;
      resumeKeyRef.current = resumeKey;

      resumeCompletion(
        { chatSessionId: activeChatSessionId, messageId: activeAssistantMessage.message_id },
        { onError: () => {} },
      );
    }, [activeAssistantMessage, activeChatSessionId, chatState, resumeCompletion, sessionQuery.isSuccess]);

    // ================================================================
    // 工具调用 → 编辑器应用流程（抽取到独立 hook）
    // ================================================================

    const { retryTick, handleRetryEdit } = useApplyAgentEdits({
      editor: props.editorAgent.editor,
      chatState,
      activeChatSessionId,
    });

    // ================================================================
    // 会话管理
    // ================================================================

    const createAndActivateSession = useCallback(async () => {
      const draftSession = await consumeDraftSession();
      const targetChatSessionId = draftSession.chat_session.id;
      queryClient.setQueryData<AgentChatState>(
        agentChatKeys.session(targetChatSessionId),
        { chat_session: draftSession.chat_session, chat_messages: [] },
      );
      upsertAgentChatSessionList(queryClient, draftSession);
      setActiveChatSessionId(targetChatSessionId);
      return draftSession;
    }, [consumeDraftSession, queryClient]);

    const ensureActiveSession = useCallback(async () => {
      if (activeChatSessionId) {
        const cachedState = queryClient.getQueryData<AgentChatState>(
          agentChatKeys.session(activeChatSessionId),
        );
        if (cachedState) return cachedState;
        return queryClient.ensureQueryData({
          queryKey: agentChatKeys.session(activeChatSessionId),
          queryFn: () => fetchAgentChatSession(activeChatSessionId),
          staleTime: Infinity,
        });
      }
      const draftSession = await createAndActivateSession();
      return { chat_session: draftSession.chat_session, chat_messages: [] } satisfies AgentChatState;
    }, [activeChatSessionId, createAndActivateSession, queryClient]);

    // ================================================================
    // 提交消息
    // ================================================================

    const submitPrompt = useCallback(
      async (prompt: string) => {
        const messageText = prompt.trim();
        if (!messageText || submitLockRef.current || isStreaming) return false;
        submitLockRef.current = true;
        setPanelError(null);
        try {
          const targetState = await ensureActiveSession();
          const selectionRef = props.editorAgent.selectionInfo
            ? props.editorAgent.buildSelectionReference(DOCUMENT_ID)
            : null;
          const atReferences = selectionRef ? [selectionRef] : [];
          await createCompletion({
            chatSessionId: targetState.chat_session.id,
            prompt: messageText,
            parentMessageId: targetState.chat_session.current_message_id,
            thinkingEnabled: false,
            searchEnabled: false,
            atReferences,
            origin: { type: "document", id: DOCUMENT_ID },
          });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "发送失败，请重试";
          setPanelError(message);
          return false;
        } finally {
          submitLockRef.current = false;
        }
      },
      [createCompletion, ensureActiveSession, isStreaming, props.editorAgent],
    );

    useImperativeHandle(ref, () => ({
      submitFromSelectionPanel(prompt) {
        if (submitLockRef.current || isStreaming) return false;
        void submitPrompt(prompt);
        return true;
      },
    }), [isStreaming, submitPrompt]);

    const handleNewChat = useCallback(() => {
      if (submitLockRef.current || isStreaming) return;
      setPanelError(null);
      void createAndActivateSession().catch((error) => {
        const message = error instanceof Error ? error.message : "创建会话失败，请重试";
        setPanelError(message);
      });
    }, [createAndActivateSession, isStreaming]);

    const handleSelectChat = useCallback((chatSessionId: string) => {
      setPanelError(null);
      setActiveChatSessionId(chatSessionId);
    }, []);

    // ================================================================
    // Render
    // ================================================================

    const title = getSessionTitle(chatState?.chat_session.title);
    const isLoadingDetail = Boolean(activeChatSessionId) && sessionQuery.isFetching && !chatState;

    return (
      <div
        className="flex h-full flex-col border-l border-[#e6ddd1] bg-[#faf7f3] text-[#2f2a24]"
        style={{ fontFamily: "var(--font-chat)" }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e6ddd1] bg-[#fbfbf8]/90 px-3 backdrop-blur">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-[#242821]">
            {title}
          </div>
          <AgentChatHistoryPopover activeChatSessionId={activeChatSessionId} onSelect={handleSelectChat} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="新会话"
            disabled={isStreaming || isPreparingDraft}
            onClick={handleNewChat}
            className="text-[#4b4e48] hover:bg-black/5"
          >
            <Plus className="size-4" />
          </Button>
        </header>

        {isLoadingDetail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[#85877f]">加载中</div>
        ) : sessionQuery.error ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-700">
            {sessionQuery.error instanceof Error ? sessionQuery.error.message : "加载失败"}
          </div>
        ) : (
          <>
            <AgentChatMessageList
              messages={messages}
              isSending={isStreaming}
              sessionId={activeChatSessionId ?? ""}
              editorAgent={props.editorAgent}
              onRetryEdit={handleRetryEdit}
              uiTick={retryTick}
            />
            {panelError ? (
              <div role="alert" className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {panelError}
              </div>
            ) : null}
            <div className="shrink-0 bg-linear-to-t from-[#faf7f3] via-[#faf7f3] to-transparent px-3 pb-4 pt-3">
              <ContextBar />
              <AgentChatPromptInput
                disabled={isStreaming}
                isSending={isStreaming || isPreparingDraft}
                onSubmit={async (prompt) => { await submitPrompt(prompt); }}
              />
            </div>
          </>
        )}
      </div>
    );
  },
);

AgentChat.displayName = "AgentChat";
