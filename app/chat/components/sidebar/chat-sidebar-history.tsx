"use client";

import { useEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { ChatHistoryItem } from "../../services/chat-history";

const INITIAL_SKELETON_COUNT = 6;
const LOAD_MORE_SKELETON_COUNT = 3;

interface ChatSidebarHistoryProps {
  activeChatId?: string | null;
  items: ChatHistoryItem[];
  hasMore: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  errorMessage?: string | null;
  onSelectChat?: (chatId: string) => void;
  onLoadMore: () => unknown;
  onRetry: () => unknown;
}

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

function HistoryListItem({
  item,
  isActive,
  onSelectChat,
}: HistoryListItemProps) {
  const displayText = item.title || item.lastMessagePreview || "未命名对话";

  return (
    <div className="group/history relative w-full min-w-0">
      <Button
        type="button"
        variant="ghost"
        data-interactive="true"
        onClick={() => onSelectChat?.(item.id)}
        className={cn(
          "w-full min-w-0 justify-start px-3",
          isActive && "bg-accent",
        )}
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

export function ChatSidebarHistory({
  activeChatId,
  items,
  hasMore,
  isInitialLoading,
  isLoadingMore,
  errorMessage,
  onSelectChat,
  onLoadMore,
  onRetry,
}: ChatSidebarHistoryProps) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const hasItems = items.length > 0;

  useEffect(() => {
    if (!hasMore || isInitialLoading || isLoadingMore) return;
    const triggerElement = loadMoreRef.current;
    const root = scrollAreaRef.current;

    if (!triggerElement || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void onLoadMore();
      },
      {
        root,
        rootMargin: "0px 0px 120px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(triggerElement);
    return () => observer.disconnect();
  }, [hasMore, isInitialLoading, isLoadingMore, onLoadMore]);

  return (
    <div
      className={cn(
        "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden",
        "opacity-100 transition-opacity duration-200 ease-linear",
        "group-data-[collapsible=icon]/sidebar:opacity-0",
        "group-data-[collapsible=icon]/sidebar:invisible",
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

          {isInitialLoading && !hasItems ? (
            <HistorySkeleton count={INITIAL_SKELETON_COUNT} />
          ) : null}

          {!isInitialLoading && !hasItems && !errorMessage ? (
            <div className="flex h-full min-h-40 items-center justify-center p-4 text-sm text-sidebar-foreground/60">
              暂无历史记录
            </div>
          ) : null}

          {errorMessage ? (
            <div className="space-y-2 rounded-md border border-red-200/60 bg-red-50/60 p-3 text-xs text-red-700">
              <p>{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-interactive="true"
                onClick={() => {
                  void onRetry();
                }}
              >
                重试
              </Button>
            </div>
          ) : null}

          {isLoadingMore ? (
            <HistorySkeleton count={LOAD_MORE_SKELETON_COUNT} />
          ) : null}

          {hasMore ? <div ref={loadMoreRef} className="h-1 w-full" /> : null}
        </div>
      </div>
    </div>
  );
}
