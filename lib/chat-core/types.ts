export type ChatPatchOperation = "APPEND" | "SET" | "BATCH";

export type ChatPatchTarget =
  | { type: "response" }
  | { type: "fragment"; id: string | number };

export interface ChatStreamPatch {
  t?: ChatPatchTarget;
  p?: string;
  o?: ChatPatchOperation;
  v?: unknown;
}

export interface ChatStreamPatchContext {
  responseMessageId: number | null;
  responseMessageIndex: number | null;
  lastTarget: ChatPatchTarget | null;
  lastPath: string | null;
  lastOperation: ChatPatchOperation | null;
}

export interface SearchQueryPayload {
  query: string;
}

export interface SearchResultPayload {
  url: string;
  title: string;
  snippet: string;
  cite_index: number;
  published_at?: number | null;
  site_icon?: string;
  site_name?: string;
  query_indexes?: number[];
}

export interface WebSearchPayload {
  queries: SearchQueryPayload[];
  results: SearchResultPayload[];
}

export type WebSearchFn = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<WebSearchPayload>;

export interface MessageCitation {
  cite_index: number;
  url: string;
  title?: string;
  site_name?: string;
}

export interface CoreFragment {
  id: number;
  type: string;
  status?: string;
  content?: string | null;
  references?: Array<Record<string, unknown>>;
  stage_id?: number | null;
  tool_name?: string;
  tool_call_id?: string;
  tool_input?: Record<string, unknown> | unknown;
  tool_output?: unknown;
  queries?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
}
