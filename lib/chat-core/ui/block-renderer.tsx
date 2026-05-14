"use client";

import type { ComponentType } from "react";
import {
  SearchBlockView,
  type SearchBlockViewProps,
} from "./search-block";
import { GenericToolView } from "./tool-block";

type CoreBlock = { type: string; [key: string]: unknown };

export interface BlockRendererProps {
  block: CoreBlock;
  customRenderers?: Record<
    string,
    ComponentType<{ block: CoreBlock }>
  >;
  searchBlockProps?: Partial<Omit<SearchBlockViewProps, "block">>;
}

type RenderableToolCallBlock = CoreBlock & {
  type: "tool_call";
  tool_name: string;
  tool_call_id?: string;
  input?: unknown;
  output?: unknown;
  content?: string | null;
};

function isToolCallBlock(block: CoreBlock): block is RenderableToolCallBlock {
  return (
    block.type === "tool_call" &&
    "tool_name" in block &&
    typeof block.tool_name === "string"
  );
}

export function BlockRenderer({
  block,
  customRenderers,
  searchBlockProps,
}: BlockRendererProps) {
  if (block.type === "search") {
    return <SearchBlockView block={block} {...searchBlockProps} />;
  }

  if (!isToolCallBlock(block)) {
    return null;
  }

  const Custom = customRenderers?.[block.tool_name];
  if (Custom) return <Custom block={block} />;

  if (block.tool_name === "web_search") {
    return <SearchBlockView block={block} {...searchBlockProps} />;
  }

  return <GenericToolView block={block} />;
}
