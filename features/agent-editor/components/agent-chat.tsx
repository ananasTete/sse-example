"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@/features/ai-sdk/hooks/use-chat/useChat";
import type { ToolCallPart } from "@/features/ai-sdk/hooks/use-chat/types";
import type {
  UseEditorAgentReturn,
  Suggestion,
  QuickAction,
  SuggestionToolInput,
} from "../types";
import { AGENT_EDITOR_API, CHAT_ID, DEFAULT_MODEL } from "../types";
import { ContextBar } from "./context-bar";
import { MessageList } from "./message-list";
import {
  createCancelAllUpdater,
  createApplySuggestionUpdater,
  createCheckSuggestionUpdater,
  createFailSuggestionUpdater,
  createCancelSuggestionUpdater,
} from "../utils/suggestion-utils";

interface AgentChatProps {
  editorAgent: UseEditorAgentReturn;
  diffCallbacksRef?: React.MutableRefObject<{
    onAccept?: (suggestionId: string) => void;
    onReject?: (suggestionId: string) => void;
  }>;
}

export function AgentChat({ editorAgent, diffCallbacksRef }: AgentChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    input,
    isLoading,
    handleInputChange,
    setInput,
    sendMessage,
    updateMessageParts,
    stop,
  } = useChat({
    api: AGENT_EDITOR_API,
    chatId: CHAT_ID,
    model: DEFAULT_MODEL,
  });

  // 将指定消息中所有建议工具的状态设为 canceled
  const cancelAllSuggestionsInMessage = useCallback(
    (messageId: string) => {
      updateMessageParts(messageId, createCancelAllUpdater());
    },
    [updateMessageParts],
  );

  // 当选区被清除时（mode 从 selection 变为 fulltext），使所有建议失效
  // 使用 ref 追踪是否已处理过模式切换，避免因 messages 变化导致重复处理
  const prevModeRef = useRef(editorAgent.mode);
  const modeChangeHandledRef = useRef(false);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    const currentMode = editorAgent.mode;

    // 检测模式是否发生变化
    if (prevMode !== currentMode) {
      prevModeRef.current = currentMode;
      modeChangeHandledRef.current = false; // 重置处理标记
    }

    // 只在模式从 selection 变为 fulltext 且尚未处理时执行
    if (
      prevMode === "selection" &&
      currentMode === "fulltext" &&
      !modeChangeHandledRef.current
    ) {
      modeChangeHandledRef.current = true;
      // 选区被清除，使所有建议失效
      messages.forEach((msg) => {
        if (msg.role === "assistant") {
          cancelAllSuggestionsInMessage(msg.id);
        }
      });
    }
  }, [editorAgent.mode, messages, cancelAllSuggestionsInMessage]);

  // ============ 全文模式：自动插入 diff 节点 ============
  // 追踪已处理的工具调用，避免重复插入
  const processedToolCallsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 只在全文模式下处理
    if (editorAgent.mode !== "fulltext") return;

    // 遍历所有消息，查找 suggest_edit 工具调用
    messages.forEach((msg) => {
      if (msg.role !== "assistant") return;

      msg.parts.forEach((part) => {
        if (part.type !== "tool-call") return;
        const toolPart = part as ToolCallPart;

        // 只处理 suggest_edit 工具
        if (toolPart.toolName !== "suggest_edit") return;

        // 只处理参数已可用的工具调用
        if (
          toolPart.state !== "input-available" &&
          toolPart.state !== "output-available"
        )
          return;

        // 检查是否已处理过
        if (processedToolCallsRef.current.has(toolPart.toolCallId)) return;

        // 标记为已处理
        processedToolCallsRef.current.add(toolPart.toolCallId);

        // 解析建议并插入 diff 节点
        const input = toolPart.input as SuggestionToolInput | undefined;
        if (!input?.suggestions) return;

        // 批量插入 diff 节点（从后向前避免位置偏移）
        const diffsToInsert = input.suggestions
          .map((s, index) => ({
            originalText: s.originalText || "",
            newText: s.newText,
            suggestionId: `${toolPart.toolCallId}-${index}`,
          }))
          .filter((d) => d.originalText); // 只处理有原文的建议

        if (diffsToInsert.length > 0) {
          // 使用 queueMicrotask 延迟执行，避免 flushSync 错误
          queueMicrotask(() => {
            editorAgent.insertMultipleDiffs(diffsToInsert);
          });
        }
      });
    });
  }, [messages, editorAgent]);

  // 应用建议 - 更新 message part 中的状态
  const handleApplySuggestion = useCallback(
    (
      messageId: string,
      toolCallId: string,
      index: number,
      suggestion: Suggestion,
    ) => {
      // 选中模式：直接替换
      if (suggestion.type === "rewrite") {
        let success = false;
        if (editorAgent.selectionInfo) {
          success = editorAgent.replaceSelection(suggestion.newText);
        }

        if (!success) {
          updateMessageParts(
            messageId,
            createFailSuggestionUpdater(toolCallId, index),
          );
          return;
        }

        // 更新状态
        updateMessageParts(
          messageId,
          createApplySuggestionUpdater(toolCallId, index),
        );
        return;
      }

      // 全文模式：插入 diff 节点，让用户在编辑器中确认
      if (suggestion.type === "edit") {
        let success = false;

        if (suggestion.position) {
          success = editorAgent.insertDiffNode(
            suggestion.position.from,
            suggestion.position.to,
            suggestion.newText,
            suggestion.id,
          );
        } else if (suggestion.originalText) {
          success = editorAgent.insertDiffByText(
            suggestion.originalText,
            suggestion.newText,
            suggestion.id,
          );
        }

        if (!success) {
          updateMessageParts(
            messageId,
            createFailSuggestionUpdater(toolCallId, index),
          );
          return;
        }

        // 不立即更新状态为 checked，等用户在编辑器中确认
        // 状态会在 handleDiffAccept/handleDiffReject 中更新
      }
    },
    [editorAgent, updateMessageParts],
  );

  // 处理编辑器中的 diff 接受回调
  const handleDiffAccept = useCallback(
    (suggestionId: string) => {
      // 解析 suggestionId 获取 toolCallId 和 index
      const lastDashIndex = suggestionId.lastIndexOf("-");
      const toolCallId = suggestionId.substring(0, lastDashIndex);
      const index = parseInt(suggestionId.substring(lastDashIndex + 1), 10);

      // 找到对应的消息并更新状态（使用 Check 而非 Apply，不影响其他建议）
      const assistantMsg = messages.findLast((msg) => msg.role === "assistant");
      if (assistantMsg) {
        updateMessageParts(
          assistantMsg.id,
          createCheckSuggestionUpdater(toolCallId, index),
        );
      }
    },
    [messages, updateMessageParts],
  );

  // 处理编辑器中的 diff 拒绝回调
  const handleDiffReject = useCallback(
    (suggestionId: string) => {
      // 解析 suggestionId 获取 toolCallId 和 index
      const lastDashIndex = suggestionId.lastIndexOf("-");
      const toolCallId = suggestionId.substring(0, lastDashIndex);
      const index = parseInt(suggestionId.substring(lastDashIndex + 1), 10);

      // 找到对应的消息并更新状态为 canceled
      const assistantMsg = messages.findLast((msg) => msg.role === "assistant");
      if (assistantMsg) {
        updateMessageParts(
          assistantMsg.id,
          createCancelSuggestionUpdater(toolCallId, index),
        );
      }
    },
    [messages, updateMessageParts],
  );

  // 将 diff 回调暴露给父组件
  useEffect(() => {
    if (diffCallbacksRef) {
      diffCallbacksRef.current = {
        onAccept: handleDiffAccept,
        onReject: handleDiffReject,
      };
    }
  }, [diffCallbacksRef, handleDiffAccept, handleDiffReject]);

  // 定位建议
  const handleLocateSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.position) {
        editorAgent.scrollToPosition(suggestion.position.from);
      }
    },
    [editorAgent],
  );

  // ============ Chat 中的接受/拒绝建议（全文模式） ============

  // 在 chat 中接受建议
  const handleAcceptSuggestion = useCallback(
    (
      messageId: string,
      toolCallId: string,
      index: number,
      suggestion: Suggestion,
    ) => {
      // 调用编辑器的 acceptDiff
      const success = editorAgent.acceptDiff(suggestion.id);
      if (success) {
        // 更新 message part 状态（使用 Check 而非 Apply，不影响其他建议）
        updateMessageParts(
          messageId,
          createCheckSuggestionUpdater(toolCallId, index),
        );
      }
    },
    [editorAgent, updateMessageParts],
  );

  // 在 chat 中拒绝建议
  const handleRejectSuggestion = useCallback(
    (
      messageId: string,
      toolCallId: string,
      index: number,
      suggestion: Suggestion,
    ) => {
      // 调用编辑器的 rejectDiff
      const success = editorAgent.rejectDiff(suggestion.id);
      if (success) {
        // 更新 message part 状态
        updateMessageParts(
          messageId,
          createCancelSuggestionUpdater(toolCallId, index),
        );
      }
    },
    [editorAgent, updateMessageParts],
  );

  // ============ 激活与取消选中模式 ============

  // 输入框聚焦时激活选中模式
  const handleInputFocus = useCallback(() => {
    editorAgent.activateSelectionMode();
  }, [editorAgent]);

  // 清除选中模式，用于快捷键和 context-bar 的取消按钮
  const handleClearSelection = useCallback(() => {
    editorAgent.clearSelectionMode();
  }, [editorAgent]);

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Escape 取消选中模式
      if (e.key === "Escape") {
        handleClearSelection();
      }
    },
    [handleClearSelection],
  );

  // ============ 提交 ============

  // 发送消息时附加上下文
  const handleSendMessage = useCallback(
    async (text: string) => {
      const context = editorAgent.getContext();

      // 发送新消息前，使最近一条 assistant 消息中的建议失效
      const lastAssistantMsg = messages.findLast(
        (msg) => msg.role === "assistant",
      );
      if (lastAssistantMsg) {
        cancelAllSuggestionsInMessage(lastAssistantMsg.id);
      }

      // 发送结构化上下文（通过特殊格式，让 API 能解析）
      const payload = JSON.stringify({ context, userRequest: text });
      await sendMessage(payload);
    },
    [editorAgent, messages, cancelAllSuggestionsInMessage, sendMessage],
  );

  // 表单提交
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const text = input;
      setInput("");
      await handleSendMessage(text);
    },
    [input, isLoading, handleSendMessage, setInput],
  );

  // context-bar 快捷操作提交
  const handleQuickAction = useCallback(
    (action: QuickAction, prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage],
  );

  return (
    <div className="h-full flex flex-col border-l border-gray-200">
      {/* 消息列表 */}
      <MessageList
        messages={messages}
        onApplySuggestion={handleApplySuggestion}
        onAcceptSuggestion={handleAcceptSuggestion}
        onRejectSuggestion={handleRejectSuggestion}
        onLocateSuggestion={handleLocateSuggestion}
      />

      {/* 上下文提示条（选中模式） */}
      {editorAgent.mode === "selection" && (
        <ContextBar
          selectionInfo={editorAgent.selectionInfo}
          onQuickAction={handleQuickAction}
          onClear={handleClearSelection}
        />
      )}

      {/* 输入区域 */}
      <form
        onSubmit={handleFormSubmit}
        className="p-3 border-t border-gray-200"
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={
              editorAgent.mode === "selection"
                ? "针对选中内容提问..."
                : "请输入..."
            }
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            disabled={isLoading}
          />
          <div className="flex flex-col gap-1">
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
              >
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              >
                发送
              </button>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-1">Escape 取消选中</div>
      </form>
    </div>
  );
}
