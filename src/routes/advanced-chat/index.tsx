import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatTree } from "../../types/chat-advanced";

export const Route = createFileRoute("/advanced-chat/")({
  component: AdvancedChatHome,
});

const SUGGESTIONS = [
  "用 TypeScript 写一个类型安全的事件总线",
  "解释 React Fiber 架构的工作原理",
  "帮我设计一个高并发聊天系统",
  "比较 Prisma 和 Drizzle 的适用场景",
];

function createBootstrapTree(chatId: string): ChatTree {
  const rootId = `chat-root-${chatId}`;
  return {
    rootId,
    currentLeafId: rootId,
    mapping: {
      [rootId]: {
        id: rootId,
        parentId: null,
        childIds: [],
        role: "root",
        message: null,
      },
    },
  };
}

function AdvancedChatHome() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      resizeTextarea(e.target);
    },
    [resizeTextarea],
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/advanced-chat", { method: "POST" });
      if (!response.ok) {
        throw new Error(`Failed to create chat: ${response.status}`);
      }
      const { id: chatId } = (await response.json()) as { id: string };
      const requestKey =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      navigate({
        to: "/advanced-chat/$chatId",
        params: { chatId },
        state: {
          entry: "bootstrap",
          requestKey,
          initialMessage: text,
          bootstrapTree: createBootstrapTree(chatId),
        } as Record<string, unknown>,
      });
    } catch (error) {
      console.error("Failed to start advanced chat:", error);
      setSubmitError("创建会话失败，请稍后重试。");
      setIsSubmitting(false);
    }
  }, [input, isSubmitting, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const fillSuggestion = (text: string) => {
    if (isSubmitting) return;
    setInput(text);
    requestAnimationFrame(() => resizeTextarea(textareaRef.current));
    textareaRef.current?.focus();
  };

  useEffect(() => {
    textareaRef.current?.focus();
    resizeTextarea(textareaRef.current);
  }, [resizeTextarea]);

  return (
    <section className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_oklch(0.88_0_0/_0.22),_transparent_58%)]" />

      <div className="w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Advanced Chat
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            你想从哪一个问题开始？
          </h1>
          <p className="text-sm text-muted-foreground">
            支持多分支对话、工具调用与实时流式输出。
          </p>
        </header>

        <div className="rounded-2xl border border-border/70 bg-card/90 shadow-sm">
          <div className="p-4 sm:p-5">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="输入问题，按 Enter 发送"
              rows={3}
              disabled={isSubmitting}
              className="min-h-[88px] max-h-[220px] resize-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 sm:px-5">
            <span className="text-[11px] text-muted-foreground">
              Enter 发送，Shift + Enter 换行
            </span>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!input.trim() || isSubmitting}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                input.trim() && !isSubmitting
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground/50",
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        <div className="grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={isSubmitting}
              onClick={() => fillSuggestion(suggestion)}
              className="rounded-xl border border-border/70 bg-background px-3 py-2 text-left text-sm text-foreground/85 transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
