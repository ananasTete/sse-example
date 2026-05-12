import type { CoreBlock, MessageCitation, WebSearchPayload } from "../types";

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

function getWebSearchResults(block: CoreBlock) {
  if (block.type === "search") {
    return block.results ?? [];
  }

  if (block.type !== "tool_call" || block.tool_name !== "web_search") {
    return [];
  }

  const output = block.output as Partial<WebSearchPayload> | null;
  return Array.isArray(output?.results) ? output.results : [];
}

export function extractCitationsFromBlocks(
  blocks: CoreBlock[],
): MessageCitation[] {
  const citationByIndex = new Map<number, MessageCitation>();

  for (const block of blocks) {
    for (const result of getWebSearchResults(block)) {
      const citeIndex = getNumberField(result, "cite_index");
      const url = getStringField(result, "url");
      if (citeIndex !== null && url) {
        citationByIndex.set(citeIndex, {
          cite_index: citeIndex,
          url,
          title: getStringField(result, "title"),
          site_name: getStringField(result, "site_name"),
        });
      }
    }
  }

  return Array.from(citationByIndex.values()).sort(
    (a, b) => a.cite_index - b.cite_index,
  );
}
