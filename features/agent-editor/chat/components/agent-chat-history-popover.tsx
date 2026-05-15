"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentChatSessionListItem } from "../types";
import { useAgentChatSessionList } from "../hooks";

interface AgentChatHistoryPopoverProps {
  activeChatSessionId: string | null;
  onSelect: (chatSessionId: string) => void;
}

function getSessionTitle(session: AgentChatSessionListItem) {
  return session.title?.trim() || "新会话";
}

export function AgentChatHistoryPopover({
  activeChatSessionId,
  onSelect,
}: AgentChatHistoryPopoverProps) {
  const chatSessionList = useAgentChatSessionList();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="会话历史"
          className="text-[#4b4e48] hover:bg-black/[0.05]"
        >
          <History className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 rounded-lg border-black/10 bg-[#fbfbf8] p-2 shadow-lg"
      >
        <div className="px-2 pb-2 text-xs font-medium text-[#85877f]">
          会话历史
        </div>
        <div className="max-h-80 overflow-y-auto pr-1">
          {chatSessionList.items.map((session) => {
            const isActive = activeChatSessionId === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
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
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-9 animate-pulse rounded-md bg-black/[0.04]"
                />
              ))}
            </div>
          ) : null}

          {!chatSessionList.isPending && chatSessionList.items.length === 0 ? (
            <div className="px-2 py-7 text-center text-sm text-[#85877f]">
              暂无会话
            </div>
          ) : null}

          {chatSessionList.hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={chatSessionList.isLoadingMore}
              onClick={() => void chatSessionList.fetchNextPage()}
              className="mt-1 h-8 w-full text-xs text-[#60635c]"
            >
              {chatSessionList.isLoadingMore ? "加载中" : "加载更多"}
            </Button>
          ) : null}

          {chatSessionList.error instanceof Error ? (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {chatSessionList.error.message}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
