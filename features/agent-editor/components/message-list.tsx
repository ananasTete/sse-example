"use client";

import { useEffect, useRef } from "react";
import type {
  Message,
  MessagePart,
  ToolCallPart,
} from "@/features/ai-sdk/hooks/use-chat/types";
import type {
  Suggestion,
  SuggestRewriteInput,
  SuggestEditInput,
} from "../types";
import { SuggestionCard } from "./suggestion-card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessageListProps {
  messages: Message[];
  onApplySuggestion: (
    toolCallId: string,
    index: number,
    suggestion: Suggestion
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

export function MessageList({
  messages,
  onApplySuggestion,
  onLocateSuggestion,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 空消息列表提示
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3">💬</div>
          <div className="text-sm">选中编辑器中的文字，或直接输入问题</div>
          <div className="text-xs mt-1">AI 将帮助你优化、改写或解释内容</div>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 overflow-y-auto p-4">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          onApplySuggestion={onApplySuggestion}
          onLocateSuggestion={onLocateSuggestion}
        />
      ))}
      {messagesEndRef && <div ref={messagesEndRef} />}
    </ScrollArea>
  );
}

interface MessageItemProps {
  message: Message;
  onApplySuggestion: (
    toolCallId: string,
    index: number,
    suggestion: Suggestion
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

function MessageItem({
  message,
  onApplySuggestion,
  onLocateSuggestion,
}: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`mt-3 first:mt-0 flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 ${
          isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"
        }`}
      >
        {/* 上下文模式标签 */}
        {message.chatId && (
          <div className="text-xs opacity-70 mb-1">
            [{message.chatId === "selection" ? "选中" : "全文"}]
          </div>
        )}

        {/* 消息内容 */}
        {message.parts.map((part, index) => (
          <MessagePartRenderer
            key={index}
            part={part}
            onApplySuggestion={onApplySuggestion}
            onLocateSuggestion={onLocateSuggestion}
          />
        ))}
      </div>
    </div>
  );
}

interface MessagePartRendererProps {
  part: MessagePart;
  onApplySuggestion: (
    toolCallId: string,
    index: number,
    suggestion: Suggestion
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

function MessagePartRenderer({
  part,
  onApplySuggestion,
  onLocateSuggestion,
}: MessagePartRendererProps) {
  switch (part.type) {
    case "text":
      return <div className="whitespace-pre-wrap">{part.text}</div>;

    case "reasoning":
      return (
        <div className="text-sm text-gray-500 italic mb-2">{part.text}</div>
      );

    case "tool-call":
      return (
        <ToolCallRenderer
          part={part}
          onApplySuggestion={onApplySuggestion}
          onLocateSuggestion={onLocateSuggestion}
        />
      );

    case "step-start":
      return null;

    default:
      return null;
  }
}

interface ToolCallRendererProps {
  part: ToolCallPart;
  onApplySuggestion: (
    toolCallId: string,
    index: number,
    suggestion: Suggestion
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

// 从 part.input 解析出建议列表
function parseSuggestionsFromPart(part: ToolCallPart): Suggestion[] {
  const { toolName, toolCallId, input } = part;

  if (toolName === "suggest_rewrite" && input) {
    const rewriteInput = input as unknown as SuggestRewriteInput;
    if (rewriteInput.suggestions) {
      return rewriteInput.suggestions.map((s, index) => ({
        id: `${toolCallId}-${index}`,
        type: "rewrite" as const,
        index,
        label: s.label,
        newText: s.newText,
        status: s.status || "idle",
      }));
    }
  }

  if (toolName === "suggest_edit" && input) {
    const editInput = input as unknown as SuggestEditInput;
    // 单个 edit（每个 tool call 只有一个 edit）
    if (editInput.edit) {
      const e = editInput.edit;
      return [{
        id: `${toolCallId}-0`,
        type: "edit" as const,
        index: 0,
        label: e.label,
        originalText: e.originalText,
        newText: e.newText,
        status: e.status || "idle",
      }];
    }
  }

  return [];
}

// 骨架加载组件
function SuggestionSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border border-gray-200 rounded-lg p-3 animate-pulse"
        >
          {/* 标签骨架 */}
          <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
          {/* 内容骨架 */}
          <div className="space-y-1.5">
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-4/5" />
          </div>
          {/* 按钮骨架 */}
          <div className="flex gap-2 mt-3">
            <div className="h-7 w-14 bg-gray-200 rounded" />
            <div className="h-7 w-14 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCallRenderer({
  part,
  onApplySuggestion,
  onLocateSuggestion,
}: ToolCallRendererProps) {
  const { toolName, state, toolCallId } = part;

  // 处理建议类工具调用
  if (toolName === "suggest_rewrite" || toolName === "suggest_edit") {
    // 正在生成中 - 显示骨架加载
    if (state === "streaming-input") {
      return <SuggestionSkeleton />;
    }

    // 参数可用，渲染建议卡片
    if (state === "input-available" || state === "output-available") {
      const suggestions = parseSuggestionsFromPart(part);

      if (suggestions.length > 0) {
        return (
          <div className="mt-2 space-y-2">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onApply={(s) => onApplySuggestion(toolCallId, s.index, s)}
                onLocate={
                  suggestion.type === "edit" ? onLocateSuggestion : undefined
                }
              />
            ))}
          </div>
        );
      }
    }
  }

  // 其他工具调用显示默认样式
  return (
    <div className="text-sm text-gray-500 bg-gray-50 rounded p-2 my-1">
      <div className="font-medium">{toolName}</div>
      {state === "streaming-input" && (
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
          <span>执行中...</span>
        </div>
      )}
    </div>
  );
}
