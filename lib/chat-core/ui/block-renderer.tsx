"use client";

import type { ComponentType } from "react";
import type { CoreBlock } from "../types";
import {
  SearchBlockView,
  type SearchBlockViewProps,
} from "./search-block";
import { GenericToolView } from "./tool-block";

export interface BlockRendererProps {
  block: CoreBlock;
  customRenderers?: Record<
    string,
    ComponentType<{ block: CoreBlock }>
  >;
  searchBlockProps?: Partial<Omit<SearchBlockViewProps, "block">>;
}

export function BlockRenderer({
  block,
  customRenderers,
  searchBlockProps,
}: BlockRendererProps) {
  if (block.type === "search") {
    return <SearchBlockView block={block} {...searchBlockProps} />;
  }

  if (block.type !== "tool_call" || !block.tool_name) {
    return null;
  }

  const Custom = customRenderers?.[block.tool_name];
  if (Custom) return <Custom block={block} />;

  if (block.tool_name === "web_search") {
    return <SearchBlockView block={block} {...searchBlockProps} />;
  }

  return <GenericToolView block={block} />;
}
