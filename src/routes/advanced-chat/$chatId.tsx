import {
  createFileRoute,
  useLocation,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Droplets,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
  StopCircle,
  Thermometer,
  User,
  Wind,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdvancedChat } from "../../hooks/use-advanced-chat";
import type {
  ChatNode,
  ChatTree,
  MessagePart,
} from "../../types/chat-advanced";
import { useAdvancedChatHistory } from "../advanced-chat";

interface WeatherSummary {
  location: string | null;
  temperature: number | null;
  temperatureHigh: number | null;
  temperatureLow: number | null;
  humidity: number | null;
  windSpeed: number | null;
  conditionText: string | null;
  conditionIcon: string | null;
  dailyForecast: Array<{
    day: string | null;
    high: number | null;
    low: number | null;
    conditionText: string | null;
    conditionIcon: string | null;
  }>;
}

interface AdvancedChatRouteState {
  entry?: "bootstrap" | "history";
  initialMessage?: string;
  requestKey?: string;
  bootstrapTree?: ChatTree;
}

function readAdvancedChatRouteState(
  state: unknown,
): AdvancedChatRouteState | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const candidate = state as Record<string, unknown>;
  const entry =
    candidate.entry === "bootstrap" || candidate.entry === "history"
      ? candidate.entry
      : undefined;
  const initialMessage =
    typeof candidate.initialMessage === "string"
      ? candidate.initialMessage
      : undefined;
  const requestKey =
    typeof candidate.requestKey === "string" ? candidate.requestKey : undefined;
  const bootstrapTree =
    typeof candidate.bootstrapTree === "object" &&
    candidate.bootstrapTree !== null
      ? (candidate.bootstrapTree as ChatTree)
      : undefined;

  if (!entry && !initialMessage && !requestKey && !bootstrapTree) {
    return null;
  }

  return {
    entry,
    initialMessage,
    requestKey,
    bootstrapTree,
  };
}

const consumedBootstrapRequests = new Set<string>();
const BOOTSTRAP_CONSUMED_STORAGE_KEY = "advanced-chat-bootstrap-consumed-v1";

function hasConsumedBootstrapRequest(requestKey: string): boolean {
  if (consumedBootstrapRequests.has(requestKey)) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const raw = window.sessionStorage.getItem(BOOTSTRAP_CONSUMED_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return false;
    return parsed.includes(requestKey);
  } catch {
    return false;
  }
}

function markBootstrapRequestConsumed(requestKey: string) {
  consumedBootstrapRequests.add(requestKey);
  if (typeof window === "undefined") {
    return;
  }
  try {
    const raw = window.sessionStorage.getItem(BOOTSTRAP_CONSUMED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
    if (!list.includes(requestKey)) {
      list.push(requestKey);
    }
    const recentList = list.slice(-100);
    window.sessionStorage.setItem(
      BOOTSTRAP_CONSUMED_STORAGE_KEY,
      JSON.stringify(recentList),
    );
  } catch {
    // ignore storage errors
  }
}

export const Route = createFileRoute("/advanced-chat/$chatId")({
  component: AdvancedChatStandalone,
});

function AdvancedChatStandalone() {
  const { chatId } = Route.useParams();
  const location = useLocation();
  const routeState = readAdvancedChatRouteState(location.state);
  const bootstrapEntry =
    routeState?.entry === "bootstrap" ? routeState : undefined;
  const bootstrapRequestKeyFromState = bootstrapEntry?.requestKey;
  const isConsumedBootstrapEntry = bootstrapRequestKeyFromState
    ? hasConsumedBootstrapRequest(bootstrapRequestKeyFromState)
    : false;
  const bootstrapTreeFromState =
    !isConsumedBootstrapEntry ? bootstrapEntry?.bootstrapTree : undefined;
  const effectiveBootstrapRequestKey =
    bootstrapRequestKeyFromState ?? "__legacy__";
  const bootstrapTreeLockRef = useRef<{
    chatId: string;
    requestKey: string;
    tree: ChatTree;
  } | null>(null);
  if (bootstrapTreeFromState) {
    const currentLock = bootstrapTreeLockRef.current;
    if (
      !currentLock ||
      currentLock.chatId !== chatId ||
      currentLock.requestKey !== effectiveBootstrapRequestKey
    ) {
      bootstrapTreeLockRef.current = {
        chatId,
        requestKey: effectiveBootstrapRequestKey,
        tree: bootstrapTreeFromState,
      };
    }
  } else if (bootstrapTreeLockRef.current?.chatId !== chatId) {
    bootstrapTreeLockRef.current = null;
  }
  const bootstrapTree =
    bootstrapTreeLockRef.current?.chatId === chatId
      ? bootstrapTreeLockRef.current.tree
      : undefined;
  const [initialTree, setInitialTree] = useState<ChatTree | null>(
    () => bootstrapTree ?? null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);

    if (bootstrapTree) {
      setInitialTree(bootstrapTree);
      return;
    }

    const abortController = new AbortController();
    setInitialTree(null);

    fetch(`/api/advanced-chat/${chatId}`, { signal: abortController.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data: ChatTree) => setInitialTree(data))
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        console.error("Failed to load chat tree:", error);
        setLoadError("会话加载失败，请刷新后重试。");
      });

    return () => abortController.abort();
  }, [bootstrapTree, chatId]);

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4">
        <div className="rounded-2xl border border-border/70 bg-card px-5 py-4 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!initialTree) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在初始化会话...
        </div>
      </div>
    );
  }

  return <ChatUI chatId={chatId} initialTree={initialTree} />;
}

function ChatUI({
  chatId,
  initialTree,
}: {
  chatId: string;
  initialTree: ChatTree;
}) {
  const {
    activeThread,
    append,
    reload,
    switchBranch,
    abort,
    isStreaming,
    messageLimit,
    tree,
  } = useAdvancedChat(chatId, initialTree);

  const [inputMessage, setInputMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const location = useLocation();
  const { refresh } = useAdvancedChatHistory();
  const initialMessageHandledRef = useRef<string | null>(null);

  const resizeComposer = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  const routeState = readAdvancedChatRouteState(location.state);
  const initialMessage =
    routeState?.entry === "bootstrap" ? routeState.initialMessage : undefined;
  const bootstrapRequestKey =
    routeState?.entry === "bootstrap" ? routeState.requestKey : undefined;

  useEffect(() => {
    const text = initialMessage?.trim();
    if (!text || !bootstrapRequestKey) return;

    if (
      initialMessageHandledRef.current === bootstrapRequestKey ||
      hasConsumedBootstrapRequest(bootstrapRequestKey)
    ) {
      return;
    }

    initialMessageHandledRef.current = bootstrapRequestKey;
    markBootstrapRequestConsumed(bootstrapRequestKey);
    void append(text);
    refresh();
  }, [append, bootstrapRequestKey, initialMessage, refresh]);

  useEffect(() => {
    if (activeThread.length >= 2 && !isStreaming) {
      refresh();
    }
  }, [activeThread.length, isStreaming, refresh]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [activeThread, isStreaming, tree.currentLeafId]);

  useEffect(() => {
    resizeComposer(textareaRef.current);
  }, [resizeComposer]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputMessage.trim();
    if (!text || isStreaming) return;
    void append(text);
    setInputMessage("");
    requestAnimationFrame(() => resizeComposer(textareaRef.current));
  };

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputMessage(e.target.value);
      resizeComposer(e.target);
    },
    [resizeComposer],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="border-b border-border/60 bg-background/90 px-4 py-3">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">当前会话</p>
            <p className="truncate text-xs text-muted-foreground">
              ID: {chatId.slice(0, 14)}...
            </p>
          </div>

          {messageLimit && (
            <div className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs text-muted-foreground sm:flex">
              <Activity className="h-3.5 w-3.5" />
              <span>剩余 {messageLimit.remaining ?? "-"}</span>
              <span>·</span>
              <span>{Math.round((messageLimit.utilization ?? 0) * 100)}%</span>
            </div>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
          {activeThread.length === 0 && (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-card">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  开始一轮新对话
                </p>
                <p className="text-xs">支持实时流式输出、工具调用与分支重试</p>
              </div>
            </div>
          )}

          {activeThread.map((node) => (
            <MessageRow
              key={node.id}
              node={node}
              tree={tree}
              onSwitchBranch={switchBranch}
              onReload={reload}
              isCurrentLeaf={node.id === tree.currentLeafId}
              isStreaming={isStreaming && node.id === tree.currentLeafId}
            />
          ))}
        </div>
      </div>

      <footer className="border-t border-border/60 bg-background/95 px-4 py-3 sm:px-6">
        <form
          onSubmit={handleSend}
          className="mx-auto flex w-full max-w-4xl items-end gap-2 sm:gap-3"
        >
          <div className="flex-1 rounded-2xl border border-border/70 bg-card px-4 py-2">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，按 Enter 发送"
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={abort}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                inputMessage.trim()
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground/50",
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}

function MessageRow({
  node,
  tree,
  onSwitchBranch,
  onReload,
  isCurrentLeaf,
  isStreaming,
}: {
  node: ChatNode;
  tree: ChatTree;
  onSwitchBranch: (id: string) => void;
  onReload: () => void;
  isCurrentLeaf: boolean;
  isStreaming: boolean;
}) {
  if (!node.message) return null;

  const isUser = node.role === "user";
  const parentNode = node.parentId ? tree.mapping[node.parentId] : null;

  let branchSwitcher: React.ReactNode = null;
  if (parentNode && parentNode.childIds.length > 1) {
    const total = parentNode.childIds.length;
    const currentIndex = parentNode.childIds.indexOf(node.id);
    branchSwitcher = (
      <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card px-1 py-0.5 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            const prevIndex = (currentIndex - 1 + total) % total;
            onSwitchBranch(parentNode.childIds[prevIndex]);
          }}
          disabled={currentIndex === 0}
          className="rounded p-0.5 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="px-1 tabular-nums">
          {currentIndex + 1}/{total}
        </span>
        <button
          type="button"
          onClick={() => {
            const nextIndex = (currentIndex + 1) % total;
            onSwitchBranch(parentNode.childIds[nextIndex]);
          }}
          disabled={currentIndex === total - 1}
          className="rounded p-0.5 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <article
        className={cn(
          "max-w-[92%] space-y-2 sm:max-w-[82%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-card",
              isUser && "bg-muted",
            )}
          >
            {isUser ? (
              <User className="h-3.5 w-3.5" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
          </span>
          <span>{isUser ? "你" : "助手"}</span>
          {branchSwitcher}
        </div>

        <div
          className={cn(
            "rounded-2xl border px-4 py-3",
            isUser
              ? "border-border/70 bg-muted/60"
              : "border-border/70 bg-card",
          )}
        >
          <MessageContent parts={node.message.parts} />

          {node.message.status === "error" && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              流式生成中断，请重试。
            </div>
          )}
          {node.message.status === "aborted" && (
            <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-100/50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
              生成已取消。
            </div>
          )}
        </div>

        {!isUser &&
          isCurrentLeaf &&
          !isStreaming &&
          node.message.status !== "error" && (
            <button
              type="button"
              onClick={onReload}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              重新生成
            </button>
          )}
      </article>
    </div>
  );
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractWeatherSummary(
  content: Record<string, unknown>[],
): WeatherSummary | null {
  const raw = toRecord(content[0]);
  if (!raw) return null;

  const condition = toRecord(raw.condition);
  const location = toString(raw.location);
  const temperature = toNumber(raw.temperature);
  const temperatureHigh = toNumber(raw.temperatureHigh);
  const temperatureLow = toNumber(raw.temperatureLow);
  const humidity = toNumber(raw.humidity);
  const windSpeed = toNumber(raw.windSpeed);
  const conditionText = toString(condition?.text);
  const conditionIcon = toString(condition?.icon);

  if (
    location === null &&
    temperature === null &&
    conditionText === null &&
    conditionIcon === null
  ) {
    return null;
  }

  const dailyForecast: WeatherSummary["dailyForecast"] = [];
  if (Array.isArray(raw.dailyForecast)) {
    for (const item of raw.dailyForecast) {
      const row = toRecord(item);
      if (!row) continue;

      const rowCondition = toRecord(row.condition);
      dailyForecast.push({
        day: toString(row.day),
        high: toNumber(row.high),
        low: toNumber(row.low),
        conditionText: toString(rowCondition?.text),
        conditionIcon: toString(rowCondition?.icon),
      });
    }
  }

  return {
    location,
    temperature,
    temperatureHigh,
    temperatureLow,
    humidity,
    windSpeed,
    conditionText,
    conditionIcon,
    dailyForecast,
  };
}

function formatTemperature(value: number | null): string {
  if (value === null) return "--";
  return `${Math.round(value)}°`;
}

function WeatherResultCard({ weather }: { weather: WeatherSummary }) {
  return (
    <section className="overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-100/70 p-4 text-sky-950 dark:border-sky-900/70 dark:from-sky-950/40 dark:via-cyan-950/35 dark:to-blue-950/35 dark:text-sky-100">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-200">
            <CloudSun className="h-3.5 w-3.5" />
            天气工具结果
          </div>
          <p className="mt-2 flex items-center gap-1 text-sm font-medium">
            <MapPin className="h-3.5 w-3.5" />
            {weather.location ?? "Unknown location"}
          </p>
          <p className="mt-1 text-xs text-sky-700/80 dark:text-sky-200/80">
            {weather.conditionIcon ?? ""} {weather.conditionText ?? "Weather"}
          </p>
        </div>

        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums">
            {formatTemperature(weather.temperature)}
            <span className="text-lg">C</span>
          </p>
          <p className="text-xs text-sky-700/80 dark:text-sky-200/80">
            当前温度
          </p>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/65 px-2.5 py-2 dark:bg-sky-900/45">
          <div className="flex items-center gap-1.5 text-sky-700/80 dark:text-sky-200/80">
            <Thermometer className="h-3.5 w-3.5" />
            最高 / 最低
          </div>
          <p className="mt-1 font-medium tabular-nums">
            {formatTemperature(weather.temperatureHigh)} /{" "}
            {formatTemperature(weather.temperatureLow)}
          </p>
        </div>

        <div className="rounded-lg bg-white/65 px-2.5 py-2 dark:bg-sky-900/45">
          <div className="flex items-center gap-1.5 text-sky-700/80 dark:text-sky-200/80">
            <Droplets className="h-3.5 w-3.5" />
            湿度
          </div>
          <p className="mt-1 font-medium tabular-nums">
            {weather.humidity === null
              ? "--"
              : `${Math.round(weather.humidity)}%`}
          </p>
        </div>

        <div className="col-span-2 rounded-lg bg-white/65 px-2.5 py-2 dark:bg-sky-900/45">
          <div className="flex items-center gap-1.5 text-sky-700/80 dark:text-sky-200/80">
            <Wind className="h-3.5 w-3.5" />
            风速
          </div>
          <p className="mt-1 font-medium tabular-nums">
            {weather.windSpeed === null
              ? "--"
              : `${Math.round(weather.windSpeed)} km/h`}
          </p>
        </div>
      </div>

      {weather.dailyForecast.length > 0 && (
        <div className="mt-4 border-t border-sky-300/60 pt-3 dark:border-sky-800/70">
          <p className="mb-2 text-xs font-medium text-sky-700/85 dark:text-sky-200/85">
            未来预报
          </p>
          <div className="grid grid-cols-2 gap-2">
            {weather.dailyForecast.slice(0, 4).map((day, index) => (
              <div
                key={`${day.day ?? "day"}-${index}`}
                className="rounded-lg bg-white/65 px-2.5 py-2 text-xs dark:bg-sky-900/45"
              >
                <p className="font-medium">{day.day ?? `Day ${index + 1}`}</p>
                <p className="mt-1 text-sky-700/80 dark:text-sky-200/80">
                  {day.conditionIcon ?? ""} {day.conditionText ?? "Weather"}
                </p>
                <p className="mt-1 tabular-nums">
                  {formatTemperature(day.high)} / {formatTemperature(day.low)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MessageContent({ parts }: { parts: MessagePart[] }) {
  if (parts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在生成...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, index) => {
        if (part.type === "reasoning") {
          return (
            <details
              key={index}
              className="group overflow-hidden rounded-lg border border-border/65 bg-background"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                <Sparkles className="h-3.5 w-3.5" />
                思考过程
                {part.state === "streaming" && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[11px]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/55" />
                    思考中
                  </span>
                )}
                {part.state !== "streaming" && (
                  <span className="ml-auto text-[11px]">已完成</span>
                )}
              </summary>
              <div className="border-t border-border/60 px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap text-foreground/85">
                {part.text}
              </div>
            </details>
          );
        }

        if (part.type === "tool_use") {
          return (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-border/70"
            >
              <div className="flex items-center gap-2 bg-muted/35 px-3 py-2 text-xs font-medium text-foreground/80">
                <Wrench className="h-3.5 w-3.5" />
                工具调用: {part.tool_name}
                {part.state === "streaming" && (
                  <span className="ml-auto text-muted-foreground">
                    参数生成中
                  </span>
                )}
              </div>
              <pre className="max-h-60 overflow-auto bg-zinc-950 px-3 py-2.5 font-mono text-xs text-zinc-100 whitespace-pre-wrap">
                {part.input_json || "等待参数..."}
              </pre>
            </div>
          );
        }

        if (part.type === "tool_result") {
          const weather = extractWeatherSummary(part.content);
          if (weather) {
            return <WeatherResultCard key={index} weather={weather} />;
          }

          return (
            <div
              key={index}
              className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/25"
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                工具执行结果
              </div>
              <pre className="font-mono text-xs whitespace-pre-wrap text-emerald-900/90 dark:text-emerald-300/90">
                {JSON.stringify(part.content, null, 2)}
              </pre>
            </div>
          );
        }

        if (part.type === "text") {
          return (
            <div
              key={index}
              className="text-[15px] leading-7 whitespace-pre-wrap"
            >
              {part.text}
              {part.state === "streaming" && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-foreground/70 align-middle" />
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
