"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@/features/ai-sdk/hooks/use-chat/useChat";
import type {
  UseEditorAgentReturn,
  Suggestion,
  QuickAction,
  SelectionInfo,
} from "../types";
import {
  AGENT_EDITOR_API,
  CHAT_ID,
  DEFAULT_MODEL,
} from "../types";
import { ContextBar } from "./context-bar";
import { MessageList } from "./message-list";
import {
  createCancelAllUpdater,
  createApplySuggestionUpdater,
  createFailSuggestionUpdater,
} from "../utils/suggestion-utils";

interface AgentChatProps {
  editorAgent: UseEditorAgentReturn;
}

export function AgentChat({ editorAgent }: AgentChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 保存发送消息时的选区信息，用于后续应用建议
  const lastSelectionInfoRef = useRef<SelectionInfo | null>(null);

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

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 输入框聚焦时激活选中模式
  const handleInputFocus = useCallback(() => {
    editorAgent.activateSelectionMode();
  }, [editorAgent]);

  // 将指定消息中所有建议工具的状态设为 canceled
  const cancelAllSuggestionsInMessage = useCallback(
    (messageId: string) => {
      updateMessageParts(messageId, createCancelAllUpdater());
    },
    [updateMessageParts]
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
      // 清除保存的选区信息
      lastSelectionInfoRef.current = null;
    }
  }, [editorAgent.mode, messages, cancelAllSuggestionsInMessage]);

  // 发送消息时附加上下文
  const handleSendMessage = useCallback(
    async (text: string) => {
      const context = editorAgent.getContext();

      // 保存当前选区信息，用于后续应用建议
      lastSelectionInfoRef.current = editorAgent.selectionInfo;

      // 发送新消息前，使所有旧消息中的建议失效
      messages.forEach((msg) => {
        if (msg.role === "assistant") {
          cancelAllSuggestionsInMessage(msg.id);
        }
      });

      // 发送结构化上下文（通过特殊格式，让 API 能解析）
      const payload = JSON.stringify({ context, userRequest: text });
      await sendMessage(payload);
    },
    [editorAgent, messages, cancelAllSuggestionsInMessage, sendMessage]
  );

  // 直接发送消息（不依赖表单事件）
  const submitMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const text = input;
    setInput(""); // 清空输入框
    await handleSendMessage(text);
  }, [input, isLoading, handleSendMessage, setInput]);

  // 表单提交
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await submitMessage();
    },
    [submitMessage]
  );

  // 快捷操作
  const handleQuickAction = useCallback(
    (action: QuickAction, prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  // 应用建议 - 更新 message part 中的状态
  const handleApplySuggestion = useCallback(
    (toolCallId: string, index: number, suggestion: Suggestion) => {
      // 找到包含该工具调用的消息
      const targetMessage = messages.find((msg) =>
        msg.parts.some(
          (part) => part.type === "tool-call" && part.toolCallId === toolCallId
        )
      );

      if (!targetMessage) return;

      // 执行替换
      let success = false;
      if (suggestion.type === "rewrite") {
        // 优先使用当前选区，如果没有则使用保存的选区信息
        if (editorAgent.selectionInfo) {
          success = editorAgent.replaceSelection(suggestion.newText);
        } else if (lastSelectionInfoRef.current) {
          // 使用保存的选区位置进行替换
          success = editorAgent.replaceAt(
            lastSelectionInfoRef.current.from,
            lastSelectionInfoRef.current.to,
            suggestion.newText
          );
        }
      } else if (suggestion.type === "edit") {
        // 全文模式：优先使用 position，否则根据 originalText 查找替换
        if (suggestion.position) {
          success = editorAgent.replaceAt(
            suggestion.position.from,
            suggestion.position.to,
            suggestion.newText
          );
        } else if (suggestion.originalText) {
          success = editorAgent.replaceText(suggestion.originalText, suggestion.newText);
        }
      }

      if (!success) {
        // 失败时标记为 failed 状态，给用户反馈
        updateMessageParts(targetMessage.id, createFailSuggestionUpdater(toolCallId, index));
        return;
      }

      // 清除保存的选区信息
      lastSelectionInfoRef.current = null;

      // 更新状态：使用工具函数
      updateMessageParts(targetMessage.id, createApplySuggestionUpdater(toolCallId, index));
    },
    [messages, editorAgent, updateMessageParts]
  );

  // 定位建议
  const handleLocateSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.position) {
        editorAgent.scrollToPosition(suggestion.position.from);
      }
    },
    [editorAgent]
  );

  // 清除选中模式
  const handleClearSelection = useCallback(() => {
    editorAgent.clearSelectionMode();
  }, [editorAgent]);

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter 发送
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitMessage();
      }
      // Escape 取消选中模式
      if (e.key === "Escape") {
        handleClearSelection();
      }
    },
    [submitMessage, handleClearSelection]
  );

  return (
    <div className="h-full flex flex-col border-l border-gray-200">
      {/* 消息列表 */}
      <MessageList
        messages={messages}
        onApplySuggestion={handleApplySuggestion}
        onLocateSuggestion={handleLocateSuggestion}
      />
      <div ref={messagesEndRef} />

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
        <div className="text-xs text-gray-400 mt-1">
          Ctrl+Enter 发送 | Escape 取消选中
        </div>
      </form>
    </div>
  );
}
