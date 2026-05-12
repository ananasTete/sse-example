export type MutationOp = "upsert" | "set" | "append" | "delete";

export type TargetType = "session" | "message" | "block" | "artifact" | "run";

export interface Target {
  type: TargetType;
  id: string | number;
  parent?: {
    type: "message" | "run" | "block";
    id: string | number;
  };
  scope?: Array<{ type: string; id: string | number }>;
}

export interface MutationEnvelope {
  run_id?: string;
  seq?: number;
  event_id?: string;
  target?: Target;
  op?: MutationOp;
  path?: string;
  value: unknown;
}

export type LifecycleType = "ready" | "done" | "error" | "keepalive";

export interface LifecycleEnvelope {
  type: LifecycleType;
  run_id?: string;
  seq?: number;
  event_id?: string;
  [key: string]: unknown;
}

export interface MutationContext {
  responseMessageId: number | null;
  responseMessageIndex: number | null;
  lastTarget: Target | null;
  lastPath: string | null;
  lastOperation: MutationOp | null;
}

export type ChatPatchOperation = "APPEND" | "SET" | "BATCH";

export type ChatPatchTarget =
  | { type: "response" }
  | { type: "block"; id: string | number };

export interface ChatStreamPatch {
  t?: ChatPatchTarget;
  p?: string;
  o?: ChatPatchOperation;
  v?: unknown;
}

export type ChatStreamPatchContext = MutationContext;

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

export type BlockType = "request" | "response" | "search" | "tool_call";

export interface CoreBlock {
  id: number;
  type: BlockType | string;
  status?: string;
  content?: string | null;
  references?: Array<Record<string, unknown>>;
  stage_id?: number | null;
  tool_name?: string;
  tool_call_id?: string;
  input?: Record<string, unknown> | unknown;
  output?: unknown;
  queries?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
}
