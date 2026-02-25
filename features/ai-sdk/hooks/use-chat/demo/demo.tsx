import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { useChat } from "../useChat";
import { Message } from "../types";
import { ToolCallRenderer } from "./ToolCallRenderer";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  SendHorizontal,
  StopCircle,
  Pencil,
  RefreshCw,
  X,
  Check,
  ChevronDown,
  Sparkles,
} from "lucide-react";

interface ChatExampleProps {
  chatId: string;
  initialMessages?: Message[];
  onConversationStart?: () => void;
}

export const ChatExample = ({
  chatId,
  initialMessages = [],
  onConversationStart,
}: ChatExampleProps) => {
  const [selectedModel, setSelectedModel] = useState("gpt-3.5-turbo");
  const [hasStartedConversation, setHasStartedConversation] = useState(
    initialMessages.length > 0
  );
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    error,
    isLoading,
    stop,
    regenerate,
  } = useChat({
    api: "/api/chats",
    chatId,
    model: selectedModel,
    initialMessages,
  });

  // 编辑状态管理
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // Auto-scroll logic
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userMessageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToLatestUserMessageRef = useRef(false);
  const pendingScrollUserToTopAfterLayoutRef = useRef(false);
  const [isResponseViewportLocked, setIsResponseViewportLocked] = useState(false);
  const [lockedTurnUserMessageId, setLockedTurnUserMessageId] = useState<string | null>(null);
  const [responsePlaceholderHeight, setResponsePlaceholderHeight] = useState<number | null>(
    null
  );
  const pinnedAssistantMessageId =
    isResponseViewportLocked && lockedTurnUserMessageId
      ? (() => {
          const userIndex = messages.findIndex(
            (message) => message.id === lockedTurnUserMessageId
          );
          if (userIndex < 0) return null;
          return (
            messages.slice(userIndex + 1).find((message) => message.role === "assistant")?.id ??
            null
          );
        })()
      : null;

  const scrollUserMessageToTop = useCallback(
    (userMessageId: string, behavior: ScrollBehavior) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const messageElement = userMessageRefs.current.get(userMessageId);
    if (!messageElement) return;

    const containerRect = container.getBoundingClientRect();
    const messageRect = messageElement.getBoundingClientRect();
    const nextScrollTop = container.scrollTop + (messageRect.top - containerRect.top);
    container.scrollTo({ top: nextScrollTop, behavior });
    },
    []
  );

  useEffect(() => {
    if (pendingScrollToLatestUserMessageRef.current) {
      const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");
      if (latestUserMessage) {
        const container = scrollContainerRef.current;
        const messageElement = userMessageRefs.current.get(latestUserMessage.id);
        if (container && messageElement) {
          const containerHeight = Math.round(container.getBoundingClientRect().height);
          const userMessageHeight = Math.round(messageElement.getBoundingClientRect().height);
          const nextMinHeight = Math.max(containerHeight - userMessageHeight, 0);
          const nextLockedUserId = latestUserMessage.id;
          requestAnimationFrame(() => {
            setLockedTurnUserMessageId(nextLockedUserId);
            setResponsePlaceholderHeight(nextMinHeight);
            pendingScrollUserToTopAfterLayoutRef.current = true;
          });
          pendingScrollToLatestUserMessageRef.current = false;
          return;
        }
      }
    }

    // No-op: placeholder height is calculated only at "send" time for the current turn.
  }, [
    messages,
    status,
    isResponseViewportLocked,
    lockedTurnUserMessageId,
    responsePlaceholderHeight,
  ]);

  useLayoutEffect(() => {
    if (!pendingScrollUserToTopAfterLayoutRef.current) return;
    if (!lockedTurnUserMessageId) return;
    if (responsePlaceholderHeight === null) return;

    pendingScrollUserToTopAfterLayoutRef.current = false;
    const userMessageId = lockedTurnUserMessageId;

    const shouldReduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const behavior: ScrollBehavior = shouldReduceMotion ? "auto" : "smooth";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollUserMessageToTop(userMessageId, behavior);
      });
    });
  }, [lockedTurnUserMessageId, responsePlaceholderHeight, scrollUserMessageToTop]);

  // 开始编辑
  const handleStartEdit = (messageId: string, currentText: string) => {
    setEditingMessageId(messageId);
    setEditingContent(currentText);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };

  // 提交编辑并重新生成
  const handleSubmitEdit = () => {
    if (!editingMessageId || !editingContent.trim()) return;
    regenerate({ userMessageId: editingMessageId, newContent: editingContent });
    setEditingMessageId(null);
    setEditingContent("");
  };

  // Auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitCurrentInput();
    }
  };

  const submitCurrentInput = async () => {
    if (!input.trim()) return;

    if (!hasStartedConversation) {
      onConversationStart?.();
      setHasStartedConversation(true);
    }

    pendingScrollToLatestUserMessageRef.current = true;
    setIsResponseViewportLocked(true);
    setResponsePlaceholderHeight(null);
    setLockedTurnUserMessageId(null);
    await handleSubmit();
  };

  const shouldRenderSubmittedPlaceholder = isResponseViewportLocked && status === "submitted";

  return (
    <div className="flex flex-col h-screen bg-[#f9f8f6] font-sans text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-start p-4 bg-[#f9f8f6]/80 backdrop-blur-md">
        <div className="relative group">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ebe6e0]/50 hover:bg-[#ebe6e0] transition-colors cursor-pointer text-sm font-medium text-stone-700">
            <span>{selectedModel}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-50" />
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isLoading}
          >
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            <option value="gpt-4">GPT-4</option>
            <option value="claude-3-opus">Claude 3 Opus</option>
          </select>
        </div>
      </header>

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={isResponseViewportLocked ? { overflowAnchor: "none" } : undefined}
      >
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-stone-400">
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-stone-300" />
              </div>
              <p className="text-base font-medium text-stone-500">
                How can I help you today?
              </p>
            </div>
          )}

          {messages.map((message) => {
            const messageText =
              message.parts.find((p) => p.type === "text")?.text || "";
            const isEditing = editingMessageId === message.id;
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                ref={(node) => {
                  if (isUser) {
                    if (node) {
                      userMessageRefs.current.set(message.id, node);
                    } else {
                      userMessageRefs.current.delete(message.id);
                    }
                    return;
                  }
                }}
                className={`group flex ${isUser ? "justify-end" : "justify-start"}`}
              >

                {/* Message Content Container */}
                <div
                  className={`flex flex-col ${
                    isUser
                      ? "items-end max-w-[85%]" // User: Bubble behavior, constained width
                      : "flex-1 min-w-0" // Assistant: Full width of the container, no shrinking
                  }`}
                >
                  {/* Message Body */}
                  <div
                    className={`relative text-sm leading-relaxed ${
                      isUser
                        ? "bg-[#efede6] text-stone-800 px-5 py-3.5 rounded-[24px] rounded-tr-lg"
                        : "w-full text-stone-800" // Assistant: No bubble background by default, raw text flow like ChatGPT
                    }`}
                    style={
                      !isUser &&
                      isResponseViewportLocked &&
                      pinnedAssistantMessageId === message.id
                        ? {
                            minHeight: `${responsePlaceholderHeight ?? 0}px`,
                          }
                        : undefined
                    }
                  >
                    <div className={`${!isUser ? "px-6 py-5 w-full" : ""}`}>
                      {isEditing && isUser ? (
                        <div className="flex flex-col gap-2 min-w-[300px]">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full p-3 bg-white border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400/50 text-stone-800"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-1">
                            <button
                              onClick={handleCancelEdit}
                              className="p-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleSubmitEdit}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {message.parts.map((part, index) => {
                            if (part.type === "step-start") return null;

                            if (part.type === "reasoning") {
                              return (
                                <div key={index} className="my-2">
                                  <details
                                    className="group/details"
                                    open={part.state === "streaming"}
                                  >
                                    <summary className="list-none cursor-pointer select-none inline-flex items-center gap-2 text-stone-500 hover:text-stone-700 transition-colors py-1">
                                      <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                      </div>
                                      <span className="text-xs font-medium">
                                        Thinking process
                                      </span>
                                      <ChevronDown className="w-3 h-3 transition-transform group-open/details:rotate-180" />
                                    </summary>
                                    <div className="mt-2 pl-3 border-l-2 border-amber-100 ml-3">
                                      <div className="text-xs text-stone-500 leading-relaxed font-mono whitespace-pre-wrap bg-stone-50/50 p-3 rounded-r-lg">
                                        {part.text}
                                        {part.state === "streaming" && (
                                          <span className="animate-pulse">
                                            ▊
                                          </span>
                                        )}
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
                                  className="rounded-xl overflow-hidden border border-stone-100"
                                >
                                  <img
                                    src={part.imageUrl}
                                    alt="AI generated"
                                    className="max-w-full h-auto"
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
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons (Hover) */}
                  <div
                    className={`mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 ${isUser ? "flex-row-reverse" : ""}`}
                  >
                    {isUser && !isEditing && (
                      <button
                        onClick={() => handleStartEdit(message.id, messageText)}
                        disabled={isLoading}
                        className="text-stone-400 hover:text-stone-600 p-1 rounded hover:bg-stone-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {message.role === "assistant" && !isLoading && (
                      <button
                        onClick={() =>
                          regenerate({ assistantMessageId: message.id })
                        }
                        className="text-stone-400 hover:text-stone-600 p-1 rounded hover:bg-stone-100 transition-colors"
                        title="Regenerate"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {shouldRenderSubmittedPlaceholder && (
            <div className="group flex justify-start">
              <div className="flex flex-col flex-1 min-w-0">
                <div
                  className="relative text-sm leading-relaxed w-full text-stone-800"
                  style={{ minHeight: `${responsePlaceholderHeight ?? 0}px` }}
                >
                  <div className="px-6 py-5 w-full">
                    <div className="h-4 w-14 rounded bg-stone-200/70 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-gradient-to-t from-[#f9f8f6] via-[#f9f8f6] to-transparent pb-8">
        <div className="max-w-3xl mx-auto relative">
          {error && (
            <div className="absolute -top-14 left-0 right-0 mx-auto w-max max-w-full flex items-center gap-2 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error.message}
            </div>
          )}

          <div className="relative flex items-end shadow-xl shadow-stone-200/50 bg-white border border-stone-200 rounded-[26px] focus-within:ring-2 focus-within:ring-stone-200/50 transition-shadow">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="w-full max-h-[200px] py-4 pl-5 pr-14 bg-transparent border-none focus:ring-0 resize-none rounded-[26px] placeholder:text-stone-400 text-stone-800 leading-relaxed scrollbar-hide"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 bottom-2">
              {isLoading ? (
                <button
                  onClick={stop}
                  className="p-2 bg-stone-900 text-white rounded-full hover:opacity-90 transition-opacity"
                >
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    void submitCurrentInput();
                  }}
                  disabled={!input.trim()}
                  className="p-2 bg-stone-900 text-white rounded-full disabled:bg-stone-200 disabled:text-stone-400 transition-colors"
                >
                  <SendHorizontal className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <div className="text-center mt-2.5">
            <p className="text-[11px] text-stone-400 font-medium">
              AI can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
