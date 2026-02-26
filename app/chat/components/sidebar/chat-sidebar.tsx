"use client";

import { useState } from "react";
import { SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { useChatHistoryQuery } from "../../hooks/use-chat-history-query";
import { ChatSidebarCollapsibleText } from "./chat-sidebar-collapsible-text";
import { ChatSidebarHistory } from "./chat-sidebar-history";
import { ChatSidebarLogo } from "./chat-sidebar-logo";
import { ChatSidebarSettingsMenu } from "./chat-sidebar-settings-menu";

const INTERACTIVE_SELECTOR = '[data-interactive="true"]';

interface ChatSidebarProps {
  activeChatId?: string | null;
  onSelectChat?: (chatId: string) => void;
  onCreateNewChat?: () => void;
}

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(INTERACTIVE_SELECTOR) !== null;

export function ChatSidebar({
  activeChatId,
  onSelectChat,
  onCreateNewChat,
}: ChatSidebarProps) {
  const { state, setOpen } = useSidebar();
  const [isPassiveHover, setIsPassiveHover] = useState(false);
  const {
    items,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    errorMessage,
    loadMore,
    reload,
  } = useChatHistoryQuery();

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "bg-sidebar",
        isCollapsed && isPassiveHover && "cursor-e-resize",
      )}
      onMouseMove={(event) => {
        if (!isCollapsed) {
          if (isPassiveHover) setIsPassiveHover(false);
          return;
        }
        const nextPassiveHover = !isInteractiveTarget(event.target);
        if (nextPassiveHover !== isPassiveHover) {
          setIsPassiveHover(nextPassiveHover);
        }
      }}
      onMouseLeave={() => {
        if (isPassiveHover) setIsPassiveHover(false);
      }}
      onClickCapture={(event) => {
        if (!isCollapsed || isInteractiveTarget(event.target)) return;
        setOpen(true);
      }}
    >
      <SidebarHeader>
        <div className="flex min-w-0 flex-1 items-center group-data-[state=collapsed]/sidebar:justify-center">
          <ChatSidebarLogo isExpandedCueVisible={isPassiveHover} />
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
          <ChatSidebarCollapsibleText>新聊天</ChatSidebarCollapsibleText>
        </Button>

        <ChatSidebarHistory
          activeChatId={activeChatId}
          items={items}
          hasMore={hasMore}
          isInitialLoading={isInitialLoading}
          isLoadingMore={isLoadingMore}
          errorMessage={errorMessage}
          onSelectChat={onSelectChat}
          onLoadMore={loadMore}
          onRetry={reload}
        />
      </SidebarContent>

      <SidebarFooter>
        <ChatSidebarSettingsMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
