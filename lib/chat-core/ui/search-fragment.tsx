"use client";

import { cn } from "@/lib/utils";
import { ExternalLink, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { CoreFragment, WebSearchPayload } from "../types";

export interface SearchFragmentViewProps {
  fragment: CoreFragment;
  className?: string;
  renderResult?: (result: Record<string, unknown>, index: number) => ReactNode;
}

function getStringField(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

function getNumberField(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" ? field : null;
}

function getSearchPayload(fragment: CoreFragment) {
  if (fragment.type === "SEARCH") {
    return {
      queries: fragment.queries ?? [],
      results: fragment.results ?? [],
    };
  }

  const output = fragment.tool_output as Partial<WebSearchPayload> | null;
  const input = fragment.tool_input as { query?: unknown } | null;
  const inputQuery = typeof input?.query === "string" ? input.query : "";

  return {
    queries: Array.isArray(output?.queries)
      ? output.queries
      : inputQuery
        ? [{ query: inputQuery }]
        : [],
    results: Array.isArray(output?.results) ? output.results : [],
  };
}

export function SearchFragmentView({
  fragment,
  className,
  renderResult,
}: SearchFragmentViewProps) {
  const payload = getSearchPayload(fragment);
  const queries = payload.queries
    .map((query) => getStringField(query, "query"))
    .filter(Boolean);
  const results = payload.results.filter((result) =>
    Boolean(getStringField(result, "url")),
  );
  const isSearching = fragment.status !== "FINISHED";

  return (
    <div
      className={cn(
        "mb-4 rounded-lg border border-[#dfe4da] bg-[#f3f7f1] px-3 py-2.5 text-sm text-[#3e4639]",
        className,
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <Search className="size-4 text-[#4f7f52]" />
        <span>{isSearching ? "正在搜索" : "网络搜索"}</span>
      </div>

      {queries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {queries.map((query, index) => (
            <span
              key={`${query}-${index}`}
              className="rounded-full bg-white px-2 py-1 text-xs text-[#596154]"
            >
              {query}
            </span>
          ))}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {results.map((result, index) => {
            if (renderResult) {
              return (
                <div key={`${getStringField(result, "url")}-${index}`}>
                  {renderResult(result as Record<string, unknown>, index)}
                </div>
              );
            }

            const url = getStringField(result, "url");
            const title = getStringField(result, "title") || url;
            const siteName = getStringField(result, "site_name");
            const citeIndex = getNumberField(result, "cite_index");

            return (
              <a
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-[#252820] hover:bg-[#edf2ea]"
              >
                <span className="shrink-0 text-[#4f7f52]">
                  {citeIndex ?? index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {siteName ? (
                  <span className="hidden shrink-0 text-[#85877f] sm:inline">
                    {siteName}
                  </span>
                ) : null}
                <ExternalLink className="size-3.5 shrink-0 text-[#85877f]" />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
