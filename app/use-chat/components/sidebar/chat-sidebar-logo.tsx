"use client";

import { PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

type ChatSidebarLogoProps = {
  isExpandedCueVisible?: boolean;
};

export function ChatSidebarLogo({
  isExpandedCueVisible = false,
}: ChatSidebarLogoProps) {
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (isCollapsed) {
    return (
      <button
        type="button"
        aria-label="展开侧边栏"
        onClick={() => setOpen(true)}
        className="relative flex size-8 items-center justify-center rounded-md text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent"
      >
        <span
          className={cn(
            "text-sm font-semibold tracking-[0.14em] transition-opacity duration-200 ease-linear",
            isExpandedCueVisible && "opacity-0",
          )}
        >
          L
        </span>
        <PanelLeftOpen
          className={cn(
            "absolute size-4 transition-opacity duration-200 ease-linear",
            isExpandedCueVisible ? "opacity-100" : "opacity-0",
          )}
        />
      </button>
    );
  }

  return (
    <span className="truncate text-sm font-semibold tracking-[0.14em] text-sidebar-foreground/90">
      LOGO
    </span>
  );
}
