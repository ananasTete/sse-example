import type { CoreFragment, MessageCitation, WebSearchPayload } from "../types";

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

function getWebSearchResults(fragment: CoreFragment) {
  if (fragment.type === "SEARCH") {
    return fragment.results ?? [];
  }

  if (fragment.type !== "TOOL_CALL" || fragment.tool_name !== "web_search") {
    return [];
  }

  const output = fragment.tool_output as Partial<WebSearchPayload> | null;
  return Array.isArray(output?.results) ? output.results : [];
}

export function extractCitationsFromFragments(
  fragments: CoreFragment[],
): MessageCitation[] {
  const citationByIndex = new Map<number, MessageCitation>();

  for (const fragment of fragments) {
    for (const result of getWebSearchResults(fragment)) {
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
