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
import { agentChatKeys } from "../chat/hooks";
import {
  fetchAgentChatSession,
  upsertAgentChatSessionList,
  useAgentChatCompletion,
  useAgentChatSessionQuery,
  useAgentDraftSession,
  useAgentResumeChatCompletion,
} from "../chat/hooks";
import { AgentChatHistoryPopover } from "../chat/components/agent-chat-history-popover";
import { AgentChatMessageList } from "../chat/components/agent-chat-message-list";
import { AgentChatPromptInput } from "../chat/components/agent-chat-prompt-input";
import type { AgentChatState } from "../chat/types";

interface AgentChatProps {
  editorAgent: UseEditorAgentReturn;
}

export interface AgentChatHandle {
  submitFromSelectionPanel: (prompt: string) => boolean;
}

function getSessionTitle(title: string | null | undefined) {
  return title?.trim() || "新会话";
}

export const AgentChat = forwardRef<AgentChatHandle, AgentChatProps>(
  function AgentChat(props, ref) {
    void props.editorAgent;

    const queryClient = useQueryClient();
    const submitLockRef = useRef(false);
    const resumeKeyRef = useRef<string | null>(null);
    const autoResumeCheckedSessionRef = useRef<string | null>(null);
    const [activeChatSessionId, setActiveChatSessionId] = useState<
      string | null
    >(null);
    const [panelError, setPanelError] = useState<string | null>(null);

    const {
      consume: consumeDraftSession,
      isLoading: isDraftSessionLoading,
      isFetching: isDraftSessionFetching,
    } = useAgentDraftSession();

    const sessionQuery = useAgentChatSessionQuery(activeChatSessionId);
    const { mutateAsync: createCompletion, isPending: isSending } =
      useAgentChatCompletion();
    const { mutate: resumeCompletion, isPending: isResuming } =
      useAgentResumeChatCompletion();

    const chatState = sessionQuery.data;
    const messages = chatState?.chat_messages ?? [];
    const activeAssistantMessage = messages.findLast(
      (message) => message.role === "ASSISTANT" && message.status === "WIP",
    );
    const isStreaming = isSending || isResuming;
    const isPreparingDraft = isDraftSessionLoading || isDraftSessionFetching;

    useEffect(() => {
      autoResumeCheckedSessionRef.current = null;
      resumeKeyRef.current = null;
    }, [activeChatSessionId]);

    // resume
    useEffect(() => {
      if (!activeChatSessionId || !sessionQuery.isSuccess || !chatState) return;
      if (autoResumeCheckedSessionRef.current === activeChatSessionId) return;

      autoResumeCheckedSessionRef.current = activeChatSessionId;
      if (!activeAssistantMessage) return;

      const resumeKey = `${activeChatSessionId}:${activeAssistantMessage.message_id}`;
      if (resumeKeyRef.current === resumeKey) return;

      resumeKeyRef.current = resumeKey;
      resumeCompletion(
        {
          chatSessionId: activeChatSessionId,
          messageId: activeAssistantMessage.message_id,
        },
        {
          onError: () => {},
        },
      );
    }, [
      activeAssistantMessage,
      activeChatSessionId,
      chatState,
      resumeCompletion,
      sessionQuery.isSuccess,
    ]);

    const createAndActivateSession = useCallback(async () => {
      const draftSession = await consumeDraftSession();
      const targetChatSessionId = draftSession.chat_session.id;

      queryClient.setQueryData<AgentChatState>(
        agentChatKeys.session(targetChatSessionId),
        {
          chat_session: draftSession.chat_session,
          chat_messages: [],
        },
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
      return {
        chat_session: draftSession.chat_session,
        chat_messages: [],
      } satisfies AgentChatState;
    }, [activeChatSessionId, createAndActivateSession, queryClient]);

    const submitPrompt = useCallback(
      async (prompt: string) => {
        const messageText = prompt.trim();
        if (!messageText || submitLockRef.current || isStreaming) return false;

        submitLockRef.current = true;
        setPanelError(null);
        try {
          const targetState = await ensureActiveSession();
          await createCompletion({
            chatSessionId: targetState.chat_session.id,
            prompt: messageText,
            parentMessageId: targetState.chat_session.current_message_id,
            thinkingEnabled: false,
            searchEnabled: false,
          });
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "发送失败，请重试";
          setPanelError(message);
          throw error;
        } finally {
          submitLockRef.current = false;
        }
      },
      [createCompletion, ensureActiveSession, isStreaming],
    );

    useImperativeHandle(
      ref,
      () => ({
        submitFromSelectionPanel(prompt) {
          if (submitLockRef.current || isStreaming) return false;

          void submitPrompt(prompt).catch(() => {});
          return true;
        },
      }),
      [isStreaming, submitPrompt],
    );

    const handleNewChat = useCallback(() => {
      if (submitLockRef.current || isStreaming) return;
      setPanelError(null);
      void createAndActivateSession().catch((error) => {
        const message =
          error instanceof Error ? error.message : "创建会话失败，请重试";
        setPanelError(message);
      });
    }, [createAndActivateSession, isStreaming]);

    const handleSelectChat = useCallback((chatSessionId: string) => {
      setPanelError(null);
      setActiveChatSessionId(chatSessionId);
    }, []);

    const title = getSessionTitle(chatState?.chat_session.title);
    const isLoadingDetail =
      Boolean(activeChatSessionId) && sessionQuery.isFetching && !chatState;

    return (
      <div
        className="flex h-full flex-col border-l border-[#e6ddd1] bg-[#faf7f3] text-[#2f2a24]"
        style={{ fontFamily: "var(--font-chat)" }}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e6ddd1] bg-[#fbfbf8]/90 px-3 backdrop-blur">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-[#242821]">
            {title}
          </div>
          <AgentChatHistoryPopover
            activeChatSessionId={activeChatSessionId}
            onSelect={handleSelectChat}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="新会话"
            disabled={isStreaming || isPreparingDraft}
            onClick={handleNewChat}
            className="text-[#4b4e48] hover:bg-black/[0.05]"
          >
            <Plus className="size-4" />
          </Button>
        </header>

        {isLoadingDetail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[#85877f]">
            加载中
          </div>
        ) : sessionQuery.error ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-700">
            {sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : "加载失败"}
          </div>
        ) : (
          <>
            <AgentChatMessageList messages={messages} isSending={isStreaming} />
            {panelError ? (
              <div
                role="alert"
                className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {panelError}
              </div>
            ) : null}
            <div className="shrink-0 bg-gradient-to-t from-[#faf7f3] via-[#faf7f3] to-transparent px-3 pb-4 pt-3">
              <AgentChatPromptInput
                disabled={isStreaming}
                isSending={isStreaming || isPreparingDraft}
                onSubmit={async (prompt) => {
                  await submitPrompt(prompt);
                }}
              />
            </div>
          </>
        )}
      </div>
    );
  },
);

AgentChat.displayName = "AgentChat";
