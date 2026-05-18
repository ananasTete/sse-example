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
import { ContextBar } from "./context-bar";
import { AgentChatHistoryPopover } from "../chat/components/agent-chat-history-popover";
import { AgentChatMessageList } from "../chat/components/agent-chat-message-list";
import { AgentChatPromptInput } from "../chat/components/agent-chat-prompt-input";
import type { AgentChatState, AgentChatToolCallBlock } from "../chat/types";
import { editApplyRecords } from "../services/edit-apply-records";
import {
  locateParagraph,
  locateParagraphSequence,
  hasDiffBlockBySuggestionId,
} from "../services/locate-paragraph";
import { createApplyEditReplacementNodes } from "../services/apply-edit-replacement";
import { getAISelectionRange } from "@/features/rich-editor/extensions/ai-selection-highlight";
import type { ProposeEditsInput } from "@/src/server/session-chat/tools/propose-edits";
import type { ApplyEditInput } from "@/src/server/session-chat/tools/apply-edit";

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
    const queryClient = useQueryClient();
    const submitLockRef = useRef(false);
    const resumeKeyRef = useRef<string | null>(null);
    const autoResumeCheckedSessionRef = useRef<string | null>(null);
    const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
    const [panelError, setPanelError] = useState<string | null>(null);
    const [retryTick, setRetryTick] = useState(0);

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

    useEffect(() => {
      autoResumeCheckedSessionRef.current = null;
      resumeKeyRef.current = null;
    }, [activeChatSessionId]);

    useEffect(() => {
      if (!activeChatSessionId || !sessionQuery.isSuccess || !chatState) return;
      if (autoResumeCheckedSessionRef.current === activeChatSessionId) return;
      autoResumeCheckedSessionRef.current = activeChatSessionId;
      if (!activeAssistantMessage) return;
      const resumeKey = `${activeChatSessionId}:${activeAssistantMessage.message_id}`;
      if (resumeKeyRef.current === resumeKey) return;
      resumeKeyRef.current = resumeKey;
      resumeCompletion(
        { chatSessionId: activeChatSessionId, messageId: activeAssistantMessage.message_id },
        { onError: () => {} },
      );
    }, [activeAssistantMessage, activeChatSessionId, chatState, resumeCompletion, sessionQuery.isSuccess]);

    // ================================================================
    // 工具调用 → 编辑器应用流程
    // ================================================================

    const applyOneEdit = useCallback(
      (params: {
        toolCallId: string;
        editId: string;
        originalText: string;
        newText: string;
        occurrenceIndex: number;
        mode: "propose" | "apply";
      }) => {
        const { editor } = props.editorAgent;

        // 已处理过的不重复执行
        const existing = editApplyRecords.lookup(params.toolCallId, params.editId);
        if (existing) return;

        if (!editor) {
          editApplyRecords.markFailed(params.toolCallId, params.editId, "editor-not-ready");
          setRetryTick((t) => t + 1);
          return;
        }

        // propose 模式：兜底检查 DiffBlock 是否已存在（内存记录丢失时的保护）
        if (params.mode === "propose" && hasDiffBlockBySuggestionId(editor.state.doc, params.editId)) {
          editApplyRecords.markApplied(params.toolCallId, params.editId);
          setRetryTick((t) => t + 1);
          return;
        }

        const located =
          locateParagraph(editor.state.doc, params.originalText, params.occurrenceIndex) ??
          (params.mode === "apply"
            ? locateParagraphSequence(
                editor.state.doc,
                params.originalText,
                params.occurrenceIndex,
              )
            : null);

        if (!located) {
          if (params.mode === "apply") {
            const range = getAISelectionRange(editor.state);
            const selectedText = range
              ? editor.state.doc.textBetween(range.from, range.to, "\n\n")
              : "";

            if (range && selectedText === params.originalText) {
              const { tr, schema } = editor.state;
              if (params.newText === "") {
                editor.view.dispatch(tr.delete(range.from, range.to));
              } else {
                editor.view.dispatch(
                  tr.replaceWith(
                    range.from,
                    range.to,
                    createApplyEditReplacementNodes(schema, params.newText),
                  ),
                );
              }

              editApplyRecords.markApplied(params.toolCallId, params.editId);
              setRetryTick((t) => t + 1);
              return;
            }
          }

          editApplyRecords.markFailed(params.toolCallId, params.editId, "not-found");
          setRetryTick((t) => t + 1);
          return;
        }

        if (params.mode === "propose") {
          editor.commands.insertParagraphDiffBlock(located.from, located.to, params.originalText, params.newText, params.editId);
        } else {
          // apply_edit：整段替换（original_text 必须是完整段落文本）
          const { tr, schema } = editor.state;
          if (params.newText === "") {
            editor.view.dispatch(tr.delete(located.from, located.to));
          } else {
            editor.view.dispatch(
              tr.replaceWith(
                located.from,
                located.to,
                createApplyEditReplacementNodes(schema, params.newText),
              ),
            );
          }
        }

        editApplyRecords.markApplied(params.toolCallId, params.editId);
        setRetryTick((t) => t + 1);
      },
      [props.editorAgent, setRetryTick],
    );

    const applyProposeEdits = useCallback(
      (block: AgentChatToolCallBlock) => {
        if (block.status !== "FINISHED") return;
        const input = Array.isArray(block.input) && block.input.length > 0 ? (block.input[0] as ProposeEditsInput) : null;
        if (!input?.edits?.length) return;

        const { editor } = props.editorAgent;
        if (!editor) {
          for (const edit of input.edits) {
            editApplyRecords.markFailed(block.tool_call_id, edit.id, "editor-not-ready");
          }
          setRetryTick((t) => t + 1);
          return;
        }

        // 收集位置后倒序应用，避免插入 DiffBlock 后位置偏移
        const positioned = input.edits
          .map((edit) => ({ edit, pos: locateParagraph(editor.state.doc, edit.original_text, edit.occurrence_index ?? 0) }))
          .filter((item): item is typeof item & { pos: NonNullable<typeof item.pos> } => item.pos !== null)
          .sort((a, b) => b.pos.from - a.pos.from);

        for (const { edit } of positioned) {
          applyOneEdit({ toolCallId: block.tool_call_id, editId: edit.id, originalText: edit.original_text, newText: edit.new_text, occurrenceIndex: edit.occurrence_index ?? 0, mode: "propose" });
        }

        const positionedIds = new Set(positioned.map(({ edit }) => edit.id));
        for (const edit of input.edits) {
          if (!positionedIds.has(edit.id)) {
            applyOneEdit({ toolCallId: block.tool_call_id, editId: edit.id, originalText: edit.original_text, newText: edit.new_text, occurrenceIndex: edit.occurrence_index ?? 0, mode: "propose" });
          }
        }
      },
      [applyOneEdit, props.editorAgent, setRetryTick],
    );

    const applyApplyEdit = useCallback(
      (block: AgentChatToolCallBlock) => {
        if (block.status !== "FINISHED") return;
        const input = Array.isArray(block.input) && block.input.length > 0 ? (block.input[0] as ApplyEditInput) : null;
        if (!input?.edits?.length) return;

        const { editor } = props.editorAgent;
        if (!editor) return;

        // 收集位置后倒序应用，避免替换后位置偏移
        const positioned = input.edits
          .map((edit, index) => ({ edit, index, pos: locateParagraph(editor.state.doc, edit.original_text, edit.occurrence_index ?? 0) }))
          .filter((item): item is typeof item & { pos: NonNullable<typeof item.pos> } => item.pos !== null)
          .sort((a, b) => b.pos.from - a.pos.from);

        for (const { edit, index } of positioned) {
          applyOneEdit({ toolCallId: block.tool_call_id, editId: `${block.tool_call_id}-${index}`, originalText: edit.original_text, newText: edit.new_text, occurrenceIndex: edit.occurrence_index ?? 0, mode: "apply" });
        }

        const positionedIndexes = new Set(positioned.map(({ index }) => index));
        for (let index = 0; index < input.edits.length; index++) {
          if (!positionedIndexes.has(index)) {
            const edit = input.edits[index];
            applyOneEdit({ toolCallId: block.tool_call_id, editId: `${block.tool_call_id}-${index}`, originalText: edit.original_text, newText: edit.new_text, occurrenceIndex: edit.occurrence_index ?? 0, mode: "apply" });
          }
        }
      },
      [applyOneEdit, props.editorAgent],
    );

    useEffect(() => {
      if (!activeChatSessionId || !chatState) return;
      for (const message of chatState.chat_messages) {
        if (message.role !== "ASSISTANT") continue;
        for (const block of message.blocks) {
          if (block.type !== "tool_call") continue;
          const toolBlock = block as AgentChatToolCallBlock;
          if (toolBlock.status !== "FINISHED") continue;
          if (toolBlock.tool_name === "propose_edits") {
            applyProposeEdits(toolBlock);
          } else if (toolBlock.tool_name === "apply_edit") {
            applyApplyEdit(toolBlock);
          }
        }
      }
    }, [activeChatSessionId, chatState, applyProposeEdits, applyApplyEdit, retryTick]);

    const handleRetryEdit = useCallback(() => {
      setRetryTick((t) => t + 1);
    }, []);

    const createAndActivateSession = useCallback(async () => {
      const draftSession = await consumeDraftSession();
      const targetChatSessionId = draftSession.chat_session.id;
      queryClient.setQueryData<AgentChatState>(agentChatKeys.session(targetChatSessionId), { chat_session: draftSession.chat_session, chat_messages: [] });
      upsertAgentChatSessionList(queryClient, draftSession);
      setActiveChatSessionId(targetChatSessionId);
      return draftSession;
    }, [consumeDraftSession, queryClient]);

    const ensureActiveSession = useCallback(async () => {
      if (activeChatSessionId) {
        const cachedState = queryClient.getQueryData<AgentChatState>(agentChatKeys.session(activeChatSessionId));
        if (cachedState) return cachedState;
        return queryClient.ensureQueryData({ queryKey: agentChatKeys.session(activeChatSessionId), queryFn: () => fetchAgentChatSession(activeChatSessionId), staleTime: Infinity });
      }
      const draftSession = await createAndActivateSession();
      return { chat_session: draftSession.chat_session, chat_messages: [] } satisfies AgentChatState;
    }, [activeChatSessionId, createAndActivateSession, queryClient]);

    const submitPrompt = useCallback(
      async (prompt: string) => {
        const messageText = prompt.trim();
        if (!messageText || submitLockRef.current || isStreaming) return false;
        submitLockRef.current = true;
        setPanelError(null);
        try {
          const targetState = await ensureActiveSession();
          const DOCUMENT_ID = "agent-editor-document";
          const selectionRef = props.editorAgent.selectionInfo ? props.editorAgent.buildSelectionReference(DOCUMENT_ID) : null;
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
          throw error;
        } finally {
          submitLockRef.current = false;
        }
      },
      [createCompletion, ensureActiveSession, isStreaming, props.editorAgent],
    );

    useImperativeHandle(ref, () => ({
      submitFromSelectionPanel(prompt) {
        if (submitLockRef.current || isStreaming) return false;
        void submitPrompt(prompt).catch(() => {});
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
            className="text-[#4b4e48] hover:bg-black/[0.05]"
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
            <div className="shrink-0 bg-gradient-to-t from-[#faf7f3] via-[#faf7f3] to-transparent px-3 pb-4 pt-3">
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
