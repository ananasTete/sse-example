"use client";

import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import type { MessageCitation } from "../types";

export interface CitationTagProps {
  citation?: MessageCitation;
  children?: React.ReactNode;
}

function getCitationTitle(citation: MessageCitation) {
  return [citation.title, citation.site_name].filter(Boolean).join(" - ");
}

export function CitationTag({ citation, children }: CitationTagProps) {
  if (!citation) {
    return <>{children}</>;
  }

  return (
    <a
      className="mx-0.5 inline-flex translate-y-[-0.08em] items-center rounded-[5px] border border-[#cad4c2] bg-[#f3f7f1] px-1.5 py-0.5 text-[0.72em] font-medium leading-none text-[#4f7f52] no-underline transition-colors hover:border-[#9fb392] hover:bg-[#e8f0e4] hover:text-[#315b35]"
      href={citation.url}
      rel="noreferrer"
      target="_blank"
      title={getCitationTitle(citation)}
    >
      {children}
    </a>
  );
}

export const defaultStreamdownPlugins = { cjk, code, math, mermaid };

export type ChatResponseProps = ComponentProps<typeof Streamdown> & {
  citations?: MessageCitation[];
  plugins?: Record<string, unknown>;
};

export const ChatResponse = memo(
  ({
    allowedTags,
    citations = [],
    className,
    components,
    literalTagContent,
    plugins,
    ...props
  }: ChatResponseProps) => {
    const citationByIndex = useMemo(() => {
      const citationMap = new Map<number, MessageCitation>();
      for (const citation of citations) {
        citationMap.set(citation.cite_index, citation);
      }
      return citationMap;
    }, [citations]);

    const mergedAllowedTags = useMemo(
      () => ({
        ...allowedTags,
        citation: Array.from(
          new Set([...(allowedTags?.citation ?? []), "cite_index"]),
        ),
      }),
      [allowedTags],
    );

    const mergedLiteralTagContent = useMemo(
      () => Array.from(new Set([...(literalTagContent ?? []), "citation"])),
      [literalTagContent],
    );

    const mergedComponents = useMemo(
      () => ({
        citation: ({
          cite_index: citeIndex,
          children,
        }: {
          cite_index?: unknown;
          children?: React.ReactNode;
        }) => {
          const citationIndex =
            typeof citeIndex === "number"
              ? citeIndex
              : typeof citeIndex === "string"
                ? Number(citeIndex)
                : Number.NaN;

          return (
            <CitationTag citation={citationByIndex.get(citationIndex)}>
              {children}
            </CitationTag>
          );
        },
        ...components,
      }),
      [components, citationByIndex],
    );

    return (
      <Streamdown
        allowedTags={mergedAllowedTags}
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className,
        )}
        components={mergedComponents}
        literalTagContent={mergedLiteralTagContent}
        plugins={{ ...defaultStreamdownPlugins, ...plugins }}
        {...props}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating &&
    nextProps.citations === prevProps.citations,
);

ChatResponse.displayName = "ChatResponse";
