"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { ChatSessionListItem } from "../types";
import { useChatSessionList } from "../hooks/useChatSessionList";

function getSessionTitle(session: ChatSessionListItem) {
  return session.title?.trim() || "新会话";
}

const CHAT_SESSION_PATH_PREFIX = "/session-chat/";

function getActiveChatSessionId(pathname: string) {
  if (!pathname.startsWith(CHAT_SESSION_PATH_PREFIX)) return null;

  const [chatSessionId] = pathname
    .slice(CHAT_SESSION_PATH_PREFIX.length)
    .split("/");

  return chatSessionId ? decodeURIComponent(chatSessionId) : null;
}

export function ChatSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionListScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  // 获取会话列表
  const chatSessionList = useChatSessionList();

  // 获取 URL 中的会话 ID
  const activeChatSessionId = useMemo(
    () => getActiveChatSessionId(location.pathname),
    [location.pathname],
  );

  // 切换到新会话
  const handleNewChat = useCallback(() => {
    void navigate({ to: "/session-chat" });
  }, [navigate]);

  // 跳转到历史会话
  const handleSelectChat = useCallback(
    (chatSessionId: string) => {
      void navigate({
        to: "/session-chat/$chat_session_id",
        params: { chat_session_id: chatSessionId },
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (
      !chatSessionList.hasMore ||
      chatSessionList.isLoadingMore ||
      chatSessionList.isFetching
    ) {
      return;
    }

    const root = sessionListScrollRef.current;
    const triggerElement = loadMoreTriggerRef.current;

    if (!root || !triggerElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void chatSessionList.fetchNextPage();
      },
      {
        root,
        rootMargin: "0px 0px 120px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(triggerElement);
    return () => observer.disconnect();
  }, [
    chatSessionList.hasMore,
    chatSessionList.isFetching,
    chatSessionList.isLoadingMore,
    chatSessionList.fetchNextPage,
  ]);

  return (
    <Sidebar collapsible="none" className="bg-[#f7f7f4]">
      <SidebarHeader className="border-b border-black/5 p-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleNewChat}
          className="h-9 w-full justify-start border-black/10 bg-white/70 text-[#242821] shadow-none hover:bg-white active:scale-95"
        >
          <Plus className="size-4" />
          新会话
        </Button>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden p-2">
        <div
          ref={sessionListScrollRef}
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          {chatSessionList.items.map((session) => {
            const isActive = activeChatSessionId === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => handleSelectChat(session.id)}
                className={cn(
                  "mb-1 flex h-9 w-full min-w-0 items-center rounded-md px-2.5 text-left text-sm transition active:scale-[0.99]",
                  isActive
                    ? "bg-white text-[#20231f] shadow-sm ring-1 ring-black/5"
                    : "text-[#4b4e48] hover:bg-black/[0.04]",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {getSessionTitle(session)}
                </span>
              </button>
            );
          })}

          {chatSessionList.isPending ? (
            <div className="space-y-2 px-1 py-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-9 animate-pulse rounded-md bg-black/[0.04]"
                />
              ))}
            </div>
          ) : null}

          {!chatSessionList.isPending && chatSessionList.items.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm text-[#85877f]">
              暂无会话
            </div>
          ) : null}

          {chatSessionList.hasMore ? (
            <div className="py-3 text-center text-xs text-[#85877f]">
              <div ref={loadMoreTriggerRef} className="h-1 w-full" />
              {chatSessionList.isLoadingMore ? "加载中" : "继续向下滚动"}
            </div>
          ) : null}

          {chatSessionList.error instanceof Error ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {chatSessionList.error.message}
            </div>
          ) : null}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
