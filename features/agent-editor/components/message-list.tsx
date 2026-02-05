"use client";

import { useEffect, useRef } from "react";
import type {
  Message,
  MessagePart,
  ToolCallPart,
} from "@/features/ai-sdk/hooks/use-chat/types";
import type { Suggestion, SuggestionToolInput } from "../types";
import { SuggestionCard } from "./suggestion-card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessageListProps {
  messages: Message[];
  onApplySuggestion: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onAcceptSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onRejectSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

export function MessageList({
  messages,
  onApplySuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
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
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center text-[#8b8074]">
          <div className="text-4xl mb-3">💬</div>
          <div className="text-sm font-medium">
            选中编辑器中的文字，或直接输入问题
          </div>
          <div className="text-xs mt-1 text-[#a99d91]">
            AI 将帮助你优化、改写或解释内容
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 overflow-y-auto px-4 py-5">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          onApplySuggestion={onApplySuggestion}
          onAcceptSuggestion={onAcceptSuggestion}
          onRejectSuggestion={onRejectSuggestion}
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
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onAcceptSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onRejectSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

function MessageItem({
  message,
  onApplySuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
  onLocateSuggestion,
}: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`mt-4 first:mt-0 flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] text-[13px] leading-6 ${
          isUser
            ? "rounded-md px-4 py-3 bg-[#2b2a28] text-[#f8f6f3] border border-[#1f1e1c] shadow-[0_10px_20px_rgba(43,42,40,0.2)]"
            : "px-1 py-1 text-[#2f2a24]"
        }`}
      >
        {/* 上下文模式标签 */}
        {message.chatId && (
          <div
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium mb-2 ${
              isUser
                ? "border-white/20 text-white/70"
                : "border-[#e1d7c9] text-[#7b6f64] bg-white/80"
            }`}
          >
            {message.chatId === "selection" ? "选中" : "全文"}
          </div>
        )}

        {/* 消息内容 */}
        <div className="space-y-2">
          {message.parts.map((part, index) => (
            <MessagePartRenderer
              key={index}
              messageId={message.id}
              part={part}
              onApplySuggestion={onApplySuggestion}
              onAcceptSuggestion={onAcceptSuggestion}
              onRejectSuggestion={onRejectSuggestion}
              onLocateSuggestion={onLocateSuggestion}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface MessagePartRendererProps {
  messageId: string;
  part: MessagePart;
  onApplySuggestion: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onAcceptSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onRejectSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

function MessagePartRenderer({
  messageId,
  part,
  onApplySuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
  onLocateSuggestion,
}: MessagePartRendererProps) {
  switch (part.type) {
    case "text":
      return (
        <div className="whitespace-pre-wrap text-[13px] leading-6">
          {part.text}
        </div>
      );

    case "reasoning":
      return (
        <div className="text-xs text-[#8e8074] italic border-l-2 border-[#e2d9cc] pl-2">
          {part.text}
        </div>
      );

    case "tool-call":
      return (
        <ToolCallRenderer
          messageId={messageId}
          part={part}
          onApplySuggestion={onApplySuggestion}
          onAcceptSuggestion={onAcceptSuggestion}
          onRejectSuggestion={onRejectSuggestion}
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
  messageId: string;
  part: ToolCallPart;
  onApplySuggestion: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onAcceptSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onRejectSuggestion?: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
}

// 从 part.input 解析出建议列表
function parseSuggestionsFromPart(part: ToolCallPart): Suggestion[] {
  const { toolName, toolCallId, input } = part;

  if (
    (toolName === "suggest_rewrite" || toolName === "suggest_edit") &&
    input
  ) {
    const toolInput = input as unknown as SuggestionToolInput;
    const type = toolName === "suggest_rewrite" ? "rewrite" : "edit";
    if (toolInput.suggestions) {
      return toolInput.suggestions.map((s, index) => ({
        id: `${toolCallId}-${index}`,
        type,
        index,
        label: s.label,
        originalText: s.originalText,
        newText: s.newText,
        status: s.status || "idle",
      }));
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
          className="border border-[#e6ddd1] rounded-md p-3 animate-pulse bg-white/70"
        >
          {/* 标签骨架 */}
          <div className="h-4 w-16 bg-[#eee6dc] rounded-sm mb-2" />
          {/* 内容骨架 */}
          <div className="space-y-1.5">
            <div className="h-3 bg-[#eee6dc] rounded-sm w-full" />
            <div className="h-3 bg-[#eee6dc] rounded-sm w-4/5" />
          </div>
          {/* 按钮骨架 */}
          <div className="flex gap-2 mt-3">
            <div className="h-7 w-14 bg-[#eee6dc] rounded-md" />
            <div className="h-7 w-14 bg-[#eee6dc] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCallRenderer({
  messageId,
  part,
  onApplySuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
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
                onApply={(s) =>
                  onApplySuggestion(messageId, toolCallId, s.index, s)
                }
                onAccept={
                  onAcceptSuggestion
                    ? (s) => onAcceptSuggestion(messageId, toolCallId, s.index, s)
                    : undefined
                }
                onReject={
                  onRejectSuggestion
                    ? (s) => onRejectSuggestion(messageId, toolCallId, s.index, s)
                    : undefined
                }
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
    <div className="text-sm text-[#7b6f64] bg-white/70 border border-[#e3dacd] rounded-md p-2 my-1">
      <div className="font-medium text-[#5f564c]">{toolName}</div>
      {state === "streaming-input" && (
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 border-2 border-[#e2d9cc] border-t-[#8a7d72] rounded-full animate-spin" />
          <span>执行中...</span>
        </div>
      )}
    </div>
  );
}
