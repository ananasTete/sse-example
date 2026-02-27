import { useEffect, useRef, useState, type RefObject } from "react";
import {
  getMessageText,
  type Message,
} from "@/features/ai-sdk/hooks/use-chat/types";
import { ToolCallRenderer } from "./tool-call-renderer";
import { MarkdownRenderer } from "./markdown-renderer";
import {
  Check,
  ChevronDown,
  Copy,
  Pencil,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

interface ChatConversationMessagesProps {
  messages: Message[];
  isHeroMode: boolean;
  isLoading: boolean;
  shouldRenderSubmittedPlaceholder: boolean;
  bottomSpacerHeight: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesContentRef: RefObject<HTMLDivElement | null>;
  isOverflowAnchorDisabled: boolean;
  registerUserMessageRef: (
    messageId: string,
    node: HTMLDivElement | null,
  ) => void;
  onRegenerateAssistant: (assistantMessageId: string) => void;
  onRegenerateUser: (userMessageId: string, newContent: string) => void;
}

const ACTION_BUTTON_STAGGER_MS = 60;
const COPY_FEEDBACK_DURATION_MS = 1500;

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Try fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function ChatConversationMessages({
  messages,
  isHeroMode,
  isLoading,
  shouldRenderSubmittedPlaceholder,
  bottomSpacerHeight,
  scrollContainerRef,
  messagesContentRef,
  isOverflowAnchorDisabled,
  registerUserMessageRef,
  onRegenerateAssistant,
  onRegenerateUser,
}: ChatConversationMessagesProps) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const lastMessage = messages[messages.length - 1];
  const activeAssistantMessageId =
    isLoading && lastMessage?.role === "assistant" ? lastMessage.id : null;

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleStartEdit = (messageId: string, currentText: string) => {
    setEditingMessageId(messageId);
    setEditingContent(currentText);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };

  const handleSubmitEdit = () => {
    if (!editingMessageId || !editingContent.trim()) return;
    onRegenerateUser(editingMessageId, editingContent);
    setEditingMessageId(null);
    setEditingContent("");
  };

  const handleCopyAssistant = async (messageId: string, text: string) => {
    if (!text.trim()) return;

    const copied = await copyTextToClipboard(text);
    if (!copied) return;

    setCopiedMessageId(messageId);

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }

    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, COPY_FEEDBACK_DURATION_MS);
  };

  const renderMessagePart = (part: Message["parts"][number], index: number) => {
    if (part.type === "step-start") return null;

    if (part.type === "reasoning") {
      return (
        <div key={index} className="my-2">
          <details className="group/details" open={part.state === "streaming"}>
            <summary className="list-none inline-flex cursor-pointer select-none items-center gap-2 py-1 text-stone-500 transition-colors hover:text-stone-700">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <span className="text-xs font-medium">Thinking process</span>
              <ChevronDown className="h-3 w-3 transition-transform group-open/details:rotate-180" />
            </summary>
            <div className="ml-3 mt-2 border-l-2 border-amber-100 pl-3">
              <div className="rounded-r-lg bg-stone-50/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-stone-500">
                {part.text}
                {part.state === "streaming" ? (
                  <span className="animate-pulse">▊</span>
                ) : null}
              </div>
            </div>
          </details>
        </div>
      );
    }

    if (part.type === "image") {
      return (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-stone-100"
        >
          <img
            src={part.imageUrl}
            alt="AI generated"
            className="h-auto max-w-full"
          />
        </div>
      );
    }

    if (part.type === "tool-call") {
      return (
        <div key={index} className="max-w-2xl">
          <ToolCallRenderer part={part} />
        </div>
      );
    }

    if (part.type === "text") {
      return (
        <div key={index} className="text-stone-800">
          <MarkdownRenderer
            content={part.text}
            isStreaming={part.state === "streaming"}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div
      ref={scrollContainerRef}
      className={`min-h-0 overflow-y-auto transition-[opacity,transform] duration-300 ease-out ${
        isHeroMode
          ? "pointer-events-none -translate-y-2 opacity-0"
          : "translate-y-0 opacity-100"
      }`}
      style={isOverflowAnchorDisabled ? { overflowAnchor: "none" } : undefined}
    >
      <div
        ref={messagesContentRef}
        className="mx-auto max-w-3xl space-y-10 px-6 py-8"
      >
        {messages.length === 0 && !isHeroMode ? (
          <div className="flex h-[60vh] flex-col items-center justify-center text-stone-400">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
              <Sparkles className="h-7 w-7 text-stone-300" />
            </div>
            <p className="text-base font-medium text-stone-500">
              How can I help you today?
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          const messageText =
            message.parts.find((part) => part.type === "text")?.text || "";
          const assistantCopyText =
            message.role === "assistant" ? getMessageText(message).trim() : "";
          const isEditing = editingMessageId === message.id;
          const isUser = message.role === "user";
          const isActiveAssistantMessage =
            message.id === activeAssistantMessageId;
          const isCopied = copiedMessageId === message.id;

          return (
            <div
              key={message.id}
              ref={(node) => {
                if (isUser) {
                  registerUserMessageRef(message.id, node);
                }
              }}
              className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex flex-col ${
                  isUser ? "max-w-[85%] items-end" : "min-w-0 flex-1"
                }`}
              >
                <div
                  className={`relative text-sm leading-relaxed ${
                    isUser
                      ? "rounded-[24px] rounded-tr-lg bg-[#efede6] px-5 py-3.5 text-stone-800"
                      : "w-full text-stone-800"
                  }`}
                >
                  <div className={isUser ? undefined : "w-full px-6 py-5"}>
                    {isEditing && isUser ? (
                      <div className="flex min-w-[300px] flex-col gap-2">
                        <textarea
                          value={editingContent}
                          onChange={(event) =>
                            setEditingContent(event.target.value)
                          }
                          className="w-full resize-none rounded-xl border border-stone-200 bg-white p-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400/50"
                          rows={3}
                          autoFocus
                        />
                        <div className="mt-1 flex justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleSubmitEdit}
                            className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {message.parts.map((part, index) =>
                          renderMessagePart(part, index),
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`mt-1 flex items-center gap-2 px-2 transition-opacity ${
                    isUser
                      ? "flex-row-reverse opacity-0 group-hover:opacity-100"
                      : "opacity-100"
                  }`}
                >
                  {isUser && !isEditing ? (
                    <button
                      onClick={() => handleStartEdit(message.id, messageText)}
                      disabled={isLoading}
                      className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}

                  {message.role === "assistant" && !isActiveAssistantMessage ? (
                    <>
                      <button
                        onClick={() => {
                          void handleCopyAssistant(
                            message.id,
                            assistantCopyText,
                          );
                        }}
                        disabled={!assistantCopyText}
                        className="animate-in fade-in-0 duration-200 rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-400"
                        style={{ animationFillMode: "backwards" }}
                        title={isCopied ? "Copied" : "Copy"}
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        className="animate-in fade-in-0 duration-200 rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                        style={{
                          animationDelay: `${ACTION_BUTTON_STAGGER_MS}ms`,
                          animationFillMode: "backwards",
                        }}
                        title="Like"
                        aria-label="Like response"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        className="animate-in fade-in-0 duration-200 rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                        style={{
                          animationDelay: `${ACTION_BUTTON_STAGGER_MS * 2}ms`,
                          animationFillMode: "backwards",
                        }}
                        title="Dislike"
                        aria-label="Dislike response"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => onRegenerateAssistant(message.id)}
                        disabled={isLoading}
                        className="animate-in fade-in-0 duration-200 rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-stone-400"
                        style={{
                          animationDelay: `${ACTION_BUTTON_STAGGER_MS * 3}ms`,
                          animationFillMode: "backwards",
                        }}
                        title="Regenerate"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {shouldRenderSubmittedPlaceholder ? (
          <div className="group flex justify-start">
            <div className="min-w-0 flex-1 flex-col">
              <div className="relative w-full text-sm leading-relaxed text-stone-800">
                <div className="w-full px-6 py-5">
                  <div className="h-4 w-14 animate-pulse rounded bg-stone-200/70" />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div
          aria-hidden
          className="pointer-events-none"
          style={{ height: `${Math.max(bottomSpacerHeight, 0)}px` }}
        />
      </div>
    </div>
  );
}
