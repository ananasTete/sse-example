"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Message,
  MessagePart,
  StructuredOutputPart,
  ToolCallPart,
} from "@/features/ai-sdk/hooks/use-chat/types";
import type { Suggestion, SuggestionToolInput } from "../types";
import { SuggestionCard } from "./suggestion-card";
import { ScrollArea } from "@/components/ui/scroll-area";

function getDisplayText(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) return text;

    const request = parsed as {
      message?: unknown;
      requestId?: unknown;
      selection?: { contentWithSelection?: unknown };
    };

    if (
      typeof request.message === "string" &&
      typeof request.requestId === "string" &&
      typeof request.selection?.contentWithSelection === "string"
    ) {
      return request.message;
    }
  } catch {
    return text;
  }

  return text;
}

interface MessageListProps {
  messages: Message[];
  onApplySuggestion: (
    messageId: string,
    toolCallId: string,
    index: number,
    suggestion: Suggestion,
  ) => void;
  onLocateSuggestion?: (suggestion: Suggestion) => void;
  onEditStructuredOutput: (messageId: string, partId: string, itemId: string, content: string) => void;
  onApplyStructuredOutput: (messageId: string, partId: string, itemId: string, content: string) => void;
}

export function MessageList({
  messages,
  onApplySuggestion,
  onLocateSuggestion,
  onEditStructuredOutput,
  onApplyStructuredOutput,
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
          onLocateSuggestion={onLocateSuggestion}
          onEditStructuredOutput={onEditStructuredOutput}
          onApplyStructuredOutput={onApplyStructuredOutput}
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
  onLocateSuggestion?: (suggestion: Suggestion) => void;
  onEditStructuredOutput: (messageId: string, partId: string, itemId: string, content: string) => void;
  onApplyStructuredOutput: (messageId: string, partId: string, itemId: string, content: string) => void;
}

function MessageItem({
  message,
  onApplySuggestion,
  onLocateSuggestion,
  onEditStructuredOutput,
  onApplyStructuredOutput,
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
              onLocateSuggestion={onLocateSuggestion}
              onEditStructuredOutput={onEditStructuredOutput}
              onApplyStructuredOutput={onApplyStructuredOutput}
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
  onLocateSuggestion?: (suggestion: Suggestion) => void;
  onEditStructuredOutput: (messageId: string, partId: string, itemId: string, content: string) => void;
  onApplyStructuredOutput: (messageId: string, partId: string, itemId: string, content: string) => void;
}

function MessagePartRenderer({
  messageId,
  part,
  onApplySuggestion,
  onLocateSuggestion,
  onEditStructuredOutput,
  onApplyStructuredOutput,
}: MessagePartRendererProps) {
  switch (part.type) {
    case "text":
      return (
        <div className="whitespace-pre-wrap text-[13px] leading-6">
          {getDisplayText(part.text)}
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
          onLocateSuggestion={onLocateSuggestion}
        />
      );

    case "structured-output":
      return (
        <StructuredOutputRenderer
          messageId={messageId}
          part={part}
          onEdit={onEditStructuredOutput}
          onApply={onApplyStructuredOutput}
        />
      );

    case "step-start":
      return null;

    default:
      return null;
  }
}

interface RewriteCardBlock {
  id: string;
  title: string;
  requestId?: string;
  content: string;
}

const rewriteCardPattern =
  /:::rewrite-card\{([^}]*)\}\s*\n([\s\S]*?)\n:::/g;

function parseDirectiveAttrs(source: string) {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function parseRewriteCards(content: string): RewriteCardBlock[] {
  const cards: RewriteCardBlock[] = [];
  let match: RegExpExecArray | null;
  rewriteCardPattern.lastIndex = 0;

  while ((match = rewriteCardPattern.exec(content))) {
    const attrs = parseDirectiveAttrs(match[1]);
    if (!attrs.id) continue;

    cards.push({
      id: attrs.id,
      title: attrs.title || attrs.id,
      requestId: attrs.requestId,
      content: match[2].trim(),
    });
  }

  return cards;
}

function StructuredOutputRenderer({
  messageId,
  part,
  onEdit,
  onApply,
}: {
  messageId: string;
  part: StructuredOutputPart;
  onEdit: (messageId: string, partId: string, itemId: string, content: string) => void;
  onApply: (messageId: string, partId: string, itemId: string, content: string) => void;
}) {
  if (part.format !== "rewrite-candidates") return null;

  const cards = parseRewriteCards(part.content);
  const appliedItemId = part.uiState?.appliedItemId;
  const savingItemIds = part.uiState?.savingItemIds ?? [];
  const failedItemIds = part.uiState?.failedItemIds ?? [];

  if (cards.length === 0) {
    return (
      <div className="whitespace-pre-wrap text-[13px] leading-6">
        {part.content}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {cards.map((card) => (
        <RewriteCandidateCard
          key={card.id}
          card={card}
          isApplied={appliedItemId === card.id}
          isSuperseded={Boolean(appliedItemId && appliedItemId !== card.id)}
          isSaving={savingItemIds.includes(card.id)}
          isFailed={failedItemIds.includes(card.id)}
          onEdit={(content) => onEdit(messageId, part.id, card.id, content)}
          onApply={() => onApply(messageId, part.id, card.id, card.content)}
        />
      ))}
    </div>
  );
}

function RewriteCandidateCard({
  card,
  isApplied,
  isSuperseded,
  isSaving,
  isFailed,
  onEdit,
  onApply,
}: {
  card: RewriteCardBlock;
  isApplied: boolean;
  isSuperseded: boolean;
  isSaving: boolean;
  isFailed: boolean;
  onEdit: (content: string) => void;
  onApply: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card.content);

  useEffect(() => {
    setDraft(card.content);
  }, [card.content]);

  const statusText = useMemo(() => {
    if (isSaving) return "保存中";
    if (isFailed) return "保存失败";
    if (isApplied) return "已应用";
    if (isSuperseded) return "已取消";
    return "";
  }, [isApplied, isFailed, isSaving, isSuperseded]);

  return (
    <div
      className={[
        "rounded-md border p-3 shadow-[0_1px_0_rgba(15,23,42,0.05)]",
        isApplied ? "border-[#6bbf7a] bg-[#f1fbf4]" : "border-[#e6ddd1] bg-[#fffaf4]",
        isSuperseded ? "opacity-60" : "",
        isFailed ? "border-[#e16b6b] bg-[#fff1f1]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-[#6f6258]">{card.title}</div>
        {statusText && <div className="text-[11px] text-[#8e8074]">{statusText}</div>}
      </div>

      {isEditing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-28 w-full resize-y rounded-md border border-[#e1d7c9] bg-white px-3 py-2 text-[13px] leading-6 text-[#2f2a24] focus:border-[#c9b89d] focus:outline-none focus:ring-2 focus:ring-[#c9b89d]"
        />
      ) : (
        <div className="rounded-md border border-[#ede4d9] bg-[#fffdf9] px-3 py-2 text-[13px] leading-6 text-[#2f2a24] whitespace-pre-wrap">
          {card.content}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            if (isEditing) {
              onEdit(draft);
              setIsEditing(false);
              return;
            }
            setIsEditing(true);
          }}
          className="rounded-md border border-[#e1d7c9] bg-white/80 px-3 py-1 text-[11px] font-medium text-[#6f6258] transition-colors hover:bg-white hover:text-[#463d34]"
        >
          {isEditing ? "保存编辑" : "编辑"}
        </button>
        <button
          type="button"
          disabled={isSuperseded}
          onClick={onApply}
          className="rounded-md bg-[#1f2a44] px-3 py-1 text-[11px] font-medium text-white shadow-[0_2px_6px_rgba(31,42,68,0.25)] transition-colors hover:bg-[#162036] disabled:bg-[#e1d9cf] disabled:text-[#7e746a]"
        >
          应用
        </button>
      </div>
    </div>
  );
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

  if (toolName === "suggest_patch") {
    return (
      <div className="text-xs text-[#7b6f64] bg-white/70 border border-[#e3dacd] rounded-md p-2 my-1">
        {state === "streaming-input" ? "正在生成修改建议..." : "修改建议已插入编辑器。"}
      </div>
    );
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
