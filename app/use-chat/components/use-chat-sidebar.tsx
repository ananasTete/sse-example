"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { SidebarLogo } from "./sidebar-logo";
import { SidebarCollapsibleText } from "./sidebar-collapsible-text";
import { SidebarSettingsMenu } from "./sidebar-settings-menu";

const HISTORY_PAGE_SIZE = 20;
const LOAD_MORE_SKELETON_COUNT = 3;

interface ChatHistoryItem {
  id: string;
  title: string;
  updatedAt: string;
  lastMessagePreview: string | null;
  messageCount: number;
}

interface ChatHistoryResponse {
  items: ChatHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface UseChatSidebarProps {
  activeChatId?: string | null;
  onSelectChat?: (chatId: string) => void;
  onCreateNewChat?: () => void;
  refreshKey?: number;
}

const mergeUniqueChats = (prev: ChatHistoryItem[], next: ChatHistoryItem[]) => {
  const merged = new Map<string, ChatHistoryItem>();
  for (const item of prev) merged.set(item.id, item);
  for (const item of next) merged.set(item.id, item);
  return Array.from(merged.values()).sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return b.id.localeCompare(a.id);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
};

function HistorySkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`history-skeleton-${index}`}
          className="animate-pulse rounded-md border border-sidebar-border/60 bg-sidebar-accent/40 p-2.5"
        >
          <div className="h-4 w-4/5 rounded bg-sidebar-foreground/15" />
        </div>
      ))}
    </div>
  );
}

interface HistoryListItemProps {
  item: ChatHistoryItem;
  isActive: boolean;
  onSelectChat?: (chatId: string) => void;
}

function HistoryListItem({ item, isActive, onSelectChat }: HistoryListItemProps) {
  const displayText = item.title || item.lastMessagePreview || "未命名对话";

  return (
    <div className="relative w-full min-w-0 group/history">
      <Button
        type="button"
        variant="ghost"
        data-interactive="true"
        onClick={() => onSelectChat?.(item.id)}
        className={cn("w-full min-w-0 justify-start px-3", isActive && "bg-accent")}
      >
        <span className="min-w-0 flex-1 truncate text-left">{displayText}</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-interactive="true"
            className={cn(
              "absolute right-0.5 top-1/2 z-10 size-7 shrink-0 -translate-y-1/2",
              "pointer-events-none opacity-0 transition-opacity",
              "group-hover/history:pointer-events-auto group-hover/history:opacity-100",
            )}
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">更多操作</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-32">
          <DropdownMenuItem>重命名</DropdownMenuItem>
          <DropdownMenuItem>删除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function UseChatSidebar({
  activeChatId,
  onSelectChat,
  onCreateNewChat,
  refreshKey = 0,
}: UseChatSidebarProps) {
  const { state, setOpen } = useSidebar();
  const [isPassiveHover, setIsPassiveHover] = useState(false);
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const latestRequestId = useRef(0);

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest('[data-interactive="true"]') !== null;

  const hasItems = items.length > 0;

  const fetchHistory = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(HISTORY_PAGE_SIZE));
    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`/api/chats?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to load chat history");
    }

    return (await response.json()) as ChatHistoryResponse;
  }, []);

  const loadInitial = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setIsInitialLoading(true);
    setIsLoadingMore(false);
    setError(null);

    try {
      const result = await fetchHistory();
      if (requestId !== latestRequestId.current) return;

      setItems(result.items);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (loadError) {
      if (requestId !== latestRequestId.current) return;
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setError(loadError instanceof Error ? loadError.message : "加载历史失败");
    } finally {
      if (requestId === latestRequestId.current) {
        setIsInitialLoading(false);
      }
    }
  }, [fetchHistory]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMore || isInitialLoading) return;

    const requestId = latestRequestId.current;
    setIsLoadingMore(true);
    setError(null);

    try {
      const result = await fetchHistory(nextCursor);
      if (requestId !== latestRequestId.current) return;
      setItems((prev) => mergeUniqueChats(prev, result.items));
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (loadError) {
      if (requestId !== latestRequestId.current) return;
      setError(loadError instanceof Error ? loadError.message : "加载更多失败");
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchHistory, hasMore, nextCursor, isLoadingMore, isInitialLoading]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial, refreshKey]);

  useEffect(() => {
    if (!hasMore || isInitialLoading) return;
    const triggerElement = loadMoreRef.current;
    const root = scrollAreaRef.current;

    if (!triggerElement || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;
        void loadMore();
      },
      {
        root,
        rootMargin: "0px 0px 120px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(triggerElement);
    return () => observer.disconnect();
  }, [hasMore, isInitialLoading, loadMore]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "bg-sidebar",
        state === "collapsed" && isPassiveHover && "cursor-e-resize",
      )}
      onMouseMove={(event) => {
        if (state !== "collapsed") {
          if (isPassiveHover) setIsPassiveHover(false);
          return;
        }
        setIsPassiveHover(!isInteractiveTarget(event.target));
      }}
      onMouseLeave={() => setIsPassiveHover(false)}
      onClickCapture={(event) => {
        if (state !== "collapsed") return;
        if (isInteractiveTarget(event.target)) return;
        setOpen(true);
      }}
    >
      <SidebarHeader>
        <div className="flex min-w-0 flex-1 items-center group-data-[state=collapsed]/sidebar:justify-center">
          <SidebarLogo isExpandedCueVisible={isPassiveHover} />
        </div>
        <SidebarTrigger
          data-interactive="true"
          className="shrink-0 rounded-md cursor-w-resize group-data-[state=collapsed]/sidebar:hidden"
        />
      </SidebarHeader>

      <SidebarContent className="gap-2 p-2">
        <Button
          data-interactive="true"
          variant="ghost"
          onClick={onCreateNewChat}
          className="w-full justify-start gap-2"
        >
          <SquarePen className="size-4" />
          <SidebarCollapsibleText>新聊天</SidebarCollapsibleText>
        </Button>

        <div
          className={cn(
            "mt-4 grid min-h-0 flex-1 grid-rows-[1fr] overflow-hidden",
            "translate-y-0 opacity-100",
            "transition-[opacity,grid-template-rows,transform] duration-200 ease-linear",
            "group-data-[collapsible=icon]/sidebar:grid-rows-[0fr]",
            "group-data-[collapsible=icon]/sidebar:opacity-0",
            "group-data-[collapsible=icon]/sidebar:pointer-events-none",
          )}
        >
          <div className="flex min-h-0 flex-col overflow-hidden">
            <p className="px-2.5 pb-2 text-xs font-medium tracking-wide text-sidebar-foreground/60">
              对话历史
            </p>
            <div
              ref={scrollAreaRef}
              className="h-full overflow-x-hidden overflow-y-auto scrollbar-hide"
            >
              {hasItems
                ? items.map((item) => (
                    <HistoryListItem
                      key={item.id}
                      item={item}
                      isActive={activeChatId === item.id}
                      onSelectChat={onSelectChat}
                    />
                  ))
                : null}

              {!isInitialLoading && !hasItems && !error ? (
                <div className="flex h-full min-h-40 items-center justify-center p-4 text-sm text-sidebar-foreground/60">
                  暂无历史记录
                </div>
              ) : null}

              {error ? (
                <div className="space-y-2 rounded-md border border-red-200/60 bg-red-50/60 p-3 text-xs text-red-700">
                  <p>{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-interactive="true"
                    onClick={() => {
                      void loadInitial();
                    }}
                  >
                    重试
                  </Button>
                </div>
              ) : null}

              {isLoadingMore ? (
                <HistorySkeleton count={LOAD_MORE_SKELETON_COUNT} />
              ) : null}
              <div ref={loadMoreRef} className="h-1 w-full" />
            </div>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSettingsMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
