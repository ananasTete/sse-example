"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const visualClassName =
  "inline-block max-w-24 overflow-hidden whitespace-nowrap visible opacity-100 transition-[max-width,opacity,visibility] duration-200 ease-linear group-data-[collapsible=icon]/sidebar:max-w-0 group-data-[collapsible=icon]/sidebar:invisible group-data-[collapsible=icon]/sidebar:pointer-events-none group-data-[collapsible=icon]/sidebar:opacity-0";

export function ChatSidebarCollapsibleText({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <>
      <span
        aria-hidden
        className={cn(visualClassName, className)}
        {...props}
      >
        {children}
      </span>
      <span className="sr-only">{children}</span>
    </>
  );
}
