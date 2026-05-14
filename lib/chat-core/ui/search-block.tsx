"use client";

import { cn } from "@/lib/utils";
import { ExternalLink, Search } from "lucide-react";
import type { ReactNode } from "react";

type CoreBlock = { type: string; [key: string]: unknown };

export interface SearchBlockViewProps {
  block: CoreBlock;
  className?: string;
  renderResult?: (result: Record<string, unknown>, index: number) => ReactNode;
}

type SearchBlockPayload = CoreBlock & {
  type: "search";
  content?: string | null;
  queries?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
};

type ToolCallSearchPayload = CoreBlock & {
  type: "tool_call";
  input?: unknown;
  output?: unknown;
};

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

function getSearchPayload(block: CoreBlock) {
  if (block.type === "search") {
    const searchBlock = block as SearchBlockPayload;
    return {
      queries: searchBlock.queries ?? [],
      results: searchBlock.results ?? [],
    };
  }

  const toolBlock = block as ToolCallSearchPayload;
  const input = Array.isArray(toolBlock.input) ? toolBlock.input : [];
  const output = Array.isArray(toolBlock.output) ? toolBlock.output : [];

  return {
    queries: input
      .map((item) => (typeof item === "object" && item !== null ? getStringField(item, "query") : ""))
      .filter(Boolean),
    results: output.filter(
      (item) => typeof item === "object" && item !== null && getStringField(item, "url"),
    ) as Array<Record<string, unknown>>,
  };
}

export function SearchBlockView({
  block,
  className,
  renderResult,
}: SearchBlockViewProps) {
  const payload = getSearchPayload(block);
  const hasOutput = payload.results.length > 0;
  const hasInput = payload.queries.length > 0;

  let label: string;
  if (hasOutput) {
    label = `已搜索 ${payload.results.length} 个网页`;
  } else if (hasInput) {
    label = `正在搜索 ${payload.queries.map((q) => `"${q}"`).join(" ")}`;
  } else {
    label = "网络搜索中";
  }

  return (
    <div
      className={cn(
        "mb-4 rounded-lg border border-[#dfe4da] bg-[#f3f7f1] px-3 py-2.5 text-sm text-[#3e4639]",
        className,
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <Search className="size-4 text-[#4f7f52]" />
        <span>{label}</span>
      </div>

      {hasOutput ? (
        <div className="mt-2 grid gap-1.5">
          {payload.results.map((result, index) => {
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
