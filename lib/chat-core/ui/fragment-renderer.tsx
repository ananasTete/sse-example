"use client";

import type { ComponentType } from "react";
import type { CoreFragment } from "../types";
import {
  SearchFragmentView,
  type SearchFragmentViewProps,
} from "./search-fragment";
import { GenericToolView } from "./tool-fragment";

export interface FragmentRendererProps {
  fragment: CoreFragment;
  customRenderers?: Record<
    string,
    ComponentType<{ fragment: CoreFragment }>
  >;
  searchFragmentProps?: Partial<Omit<SearchFragmentViewProps, "fragment">>;
}

export function FragmentRenderer({
  fragment,
  customRenderers,
  searchFragmentProps,
}: FragmentRendererProps) {
  if (fragment.type === "SEARCH") {
    return <SearchFragmentView fragment={fragment} {...searchFragmentProps} />;
  }

  if (fragment.type !== "TOOL_CALL" || !fragment.tool_name) {
    return null;
  }

  const Custom = customRenderers?.[fragment.tool_name];
  if (Custom) return <Custom fragment={fragment} />;

  if (fragment.tool_name === "web_search") {
    return <SearchFragmentView fragment={fragment} {...searchFragmentProps} />;
  }

  return <GenericToolView fragment={fragment} />;
}
