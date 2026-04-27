"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  createFailSuggestionUpdater,
} from "../utils/suggestion-utils";
import {
  applyEditorAIPatch,
  type EditorAIPatchResult,
} from "../services/editor-ai-context";

interface AgentChatProps {
  editorAgent: UseEditorAgentReturn;
}

export function AgentChat({ editorAgent }: AgentChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [patchError, setPatchError] = useState<string | null>(null);

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

  const processedPatchCallsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.role !== "assistant") return;

      msg.parts.forEach((part) => {
        if (part.type !== "tool-call") return;
        const toolPart = part as ToolCallPart;

        if (toolPart.toolName !== "suggest_patch") return;
        if (
          toolPart.state !== "input-available" &&
          toolPart.state !== "output-available"
        )
          return;
        if (processedPatchCallsRef.current.has(toolPart.toolCallId)) return;

        processedPatchCallsRef.current.add(toolPart.toolCallId);

        const input = toolPart.input as
          | { patches?: EditorAIPatchResult[] }
          | undefined;
        const patches = input?.patches ?? [];

        queueMicrotask(() => {
          const editor = editorAgent.editor;
          if (!editor) {
            setPatchError("编辑器未准备好，请稍后重试。");
            return;
          }

          for (const patch of patches) {
            const result = applyEditorAIPatch(editor, patch);
            if (result.status === "stale") {
              setPatchError(result.reason);
            }
          }
        });
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

      // 全文编辑建议由编辑器 diffBlock 负责接受和拒绝。
    },
    [editorAgent, updateMessageParts],
  );

  // 定位建议
  const handleLocateSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.position) {
        editorAgent.scrollToPosition(suggestion.position.from);
      }
    },
    [editorAgent],
  );

  // ============ 激活与取消选中模式 ============

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
      const request = editorAgent.createAIRequest(text);
      setPatchError(null);

      // 发送新消息前，使最近一条 assistant 消息中的建议失效
      const lastAssistantMsg = messages.findLast(
        (msg) => msg.role === "assistant",
      );
      if (lastAssistantMsg) {
        cancelAllSuggestionsInMessage(lastAssistantMsg.id);
      }

      await sendMessage(request ? JSON.stringify(request) : text);
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
    <div
      className="h-full flex flex-col border-l border-[#e6ddd1] bg-[#faf7f3] text-[#2f2a24]"
      style={{ fontFamily: "var(--font-chat)" }}
    >
      {/* 消息列表 */}
      <MessageList
        messages={messages}
        onApplySuggestion={handleApplySuggestion}
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

      {patchError && (
        <div className="border-t border-[#f0d5d5] bg-[#fff5f5] px-3 py-2 text-xs text-[#a34242]">
          {patchError}
        </div>
      )}

      {/* 输入区域 */}
      <form
        onSubmit={handleFormSubmit}
        className="p-3 border-t border-[#e6ddd1] bg-[#faf7f3]"
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              editorAgent.mode === "selection"
                ? "针对选中内容提问..."
                : "请输入..."
            }
            className="flex-1 resize-none rounded-md border border-[#e2d9cc] bg-white/90 px-3 py-2 text-[13px] leading-5 text-[#2f2a24] placeholder:text-[#9b8f83] shadow-[0_1px_0_rgba(63,53,45,0.05)] focus:outline-none focus:ring-2 focus:ring-[#c9b89d] focus:border-[#c9b89d]"
            rows={2}
            disabled={isLoading}
          />
          <div className="flex flex-col gap-1">
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="px-4 py-2 rounded-md bg-[#b24a4a] text-white text-sm shadow-[0_2px_6px_rgba(178,74,74,0.22)] hover:bg-[#9f3e3e]"
              >
                停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 rounded-md bg-[#1f2a44] text-white text-sm shadow-[0_2px_6px_rgba(31,42,68,0.25)] hover:bg-[#162036] disabled:bg-[#e1d9cf] disabled:text-[#7e746a] disabled:cursor-not-allowed"
              >
                发送
              </button>
            )}
          </div>
        </div>
        <div className="text-xs text-[#a09286] mt-1">Escape 取消选中</div>
      </form>
    </div>
  );
}
