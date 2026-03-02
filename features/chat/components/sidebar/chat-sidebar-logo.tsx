"use client";

import { Ghost, PanelLeftOpen } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

type ChatSidebarLogoProps = {
  isExpandedCueVisible?: boolean;
};

export function ChatSidebarLogo({
  isExpandedCueVisible = false,
}: ChatSidebarLogoProps) {
  const { state, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Button
      type="button"
      variant={"ghost"}
      size={"icon"}
      aria-label="展开侧边栏"
      onClick={() => setOpen(true)}
      className="size-10"
    >
      {isCollapsed && isExpandedCueVisible ? <PanelLeftOpen /> : <Ghost />}
    </Button>
  );
}
