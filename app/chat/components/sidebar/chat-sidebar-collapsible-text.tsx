"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const baseClassName =
  "inline-block max-w-24 overflow-hidden whitespace-nowrap opacity-100 transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]/sidebar:max-w-0 group-data-[collapsible=icon]/sidebar:opacity-0";

export function ChatSidebarCollapsibleText({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span className={cn(baseClassName, className)} {...props} />;
}
