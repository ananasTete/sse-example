import { jsonSchema, tool } from "ai";
import type {
  SearchQueryPayload,
  SearchResultPayload,
  WebSearchFn,
} from "../../types";

export const TAVILY_API_KEY_ENV = "TAVILY_API_KEY";
export const TAVILY_API_BASE_URL_ENV = "TAVILY_API_BASE_URL";
export const DEFAULT_TAVILY_API_BASE_URL = "https://api.tavily.com";
export const DEFAULT_TAVILY_MAX_RESULTS = 10;

export interface WebSearchToolConfig {
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
  search?: WebSearchFn;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function getStringField(value: unknown, key: string) {
  if (!isRecord(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function getNumberField(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === "number" ? field : null;
}

function getArrayField(value: unknown, key: string) {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field) ? field : [];
}

export function toSearchQueryPayload(query: string): SearchQueryPayload | null {
  const normalizedQuery = query.trim();
  return normalizedQuery ? { query: normalizedQuery } : null;
}

export function getSiteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getEpochSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time / 1000;
}

export function toSearchResultPayload(
  value: unknown,
  citeIndex: number,
): SearchResultPayload | null {
  if (!isRecord(value)) return null;

  const url = getStringField(value, "url");
  if (!url) return null;

  const title = getStringField(value, "title") || url;
  const snippet =
    getStringField(value, "content") ||
    getStringField(value, "snippet") ||
    getStringField(value, "text");
  const publishedAt =
    getEpochSeconds(value.published_at) ??
    getEpochSeconds(value.publishedAt) ??
    getEpochSeconds(value.published_date) ??
    getEpochSeconds(value.publishedDate);
  const siteIcon =
    getStringField(value, "favicon") ||
    getStringField(value, "site_icon") ||
    getStringField(value, "siteIcon");
  const siteName =
    getStringField(value, "site_name") ||
    getStringField(value, "siteName") ||
    getStringField(value, "source") ||
    getSiteName(url);

  return {
    url,
    title,
    snippet,
    cite_index: getNumberField(value, "cite_index") ?? citeIndex,
    ...(publishedAt !== null ? { published_at: publishedAt } : {}),
    ...(siteIcon ? { site_icon: siteIcon } : {}),
    ...(siteName ? { site_name: siteName } : {}),
    query_indexes: [0],
  } satisfies SearchResultPayload;
}

export async function runTavilySearch(
  queryText: string,
  options: { signal?: AbortSignal } & WebSearchToolConfig = {},
): Promise<SearchResultPayload[]> {
  const query = toSearchQueryPayload(queryText);
  if (!query) {
    return [];
  }

  const apiKey = options.apiKey ?? process.env[TAVILY_API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Missing ${TAVILY_API_KEY_ENV} environment variable`);
  }

  const baseURL =
    options.baseUrl ??
    process.env[TAVILY_API_BASE_URL_ENV] ??
    DEFAULT_TAVILY_API_BASE_URL;
  const response = await fetch(`${baseURL.replace(/\/$/, "")}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: query.query,
      topic: "general",
      search_depth: "basic",
      max_results: options.maxResults ?? DEFAULT_TAVILY_MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Tavily search failed: ${response.status}${errorText ? ` ${errorText.slice(0, 300)}` : ""}`,
    );
  }

  const data = (await response.json()) as unknown;
  const results = getArrayField(data, "results")
    .map((item, index) => toSearchResultPayload(item, index + 1))
    .filter((item): item is SearchResultPayload => item !== null);

  return results;
}

export function buildSearchSystemPrompt(searchResults: SearchResultPayload[]) {
  if (searchResults.length === 0) return undefined;

  return [
    "你可以使用 web_search 工具搜索网络获取最新信息。",
    "回答必须基于搜索结果；引用来源时使用 <citation cite_index=\"N\">N</citation>，N 对应搜索结果编号。",
    "搜索结果无法支持的内容，直接说明当前搜索结果未提供。",
    "",
    ...searchResults.map((result) =>
      [
        `[${result.cite_index}] ${result.title}`,
        `URL: ${result.url}`,
        result.published_at
          ? `Published at: ${new Date(result.published_at * 1000).toISOString()}`
          : null,
        `Snippet: ${result.snippet}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

export function createWebSearchTool(config: WebSearchToolConfig = {}) {
  return tool<{ query: string }, SearchResultPayload[]>({
    description:
      "搜索网络获取最新信息。回答中引用搜索结果时使用 <citation cite_index=\"N\">N</citation>。",
    inputSchema: jsonSchema<{ query: string }>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
      },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: async ({ query }, { abortSignal }) => {
      if (config.search) {
        return config.search(query, { signal: abortSignal });
      }

      return runTavilySearch(query, {
        signal: abortSignal,
        ...config,
      });
    },
  });
}
