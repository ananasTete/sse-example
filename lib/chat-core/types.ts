// ===== Protocol Layer =====

export type PatchOp = "add" | "append" | "set" | "batch";

export interface PatchEnvelope {
  o?: PatchOp;
  p?: string;
  v: unknown;
}

/** A single item inside a batch — inherits parent o/p if omitted */
export interface BatchItem {
  o?: Exclude<PatchOp, "batch">;
  p?: string;
  v: unknown;
}

export interface PatchContext {
  lastOp: PatchOp | null;
  lastPath: string | null;
}

// Named event payloads
export interface ReadyPayload {
  response_message_id: number;
  user_message_id: number;
  session_id: string;
}

export interface SessionPayload {
  title?: string;
  updated_at?: number;
}

export type RunStatus = "finished" | "failed" | "cancelled";

export interface DonePayload {
  status: RunStatus;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

// ===== Domain Layer =====

export type MessageRole = "USER" | "ASSISTANT";
export type MessageStatus = "WIP" | "FINISHED" | "FAILED";
export type BlockStatus = "WIP" | "FINISHED" | "FAILED";

export interface TextBlock {
  type: "text";
  content: string;
  references?: Array<Record<string, unknown>>;
}

export interface ToolCallBlock {
  type: "tool_call";
  tool_name: string;
  tool_call_id: string;
  status: BlockStatus;
  input: unknown;
  output: unknown;
}

export interface ReasoningBlock {
  type: "reasoning";
  content: string;
}

export type Block =
  | TextBlock
  | ToolCallBlock
  | ReasoningBlock
  | Record<string, unknown>;

export interface CoreMessage {
  message_id: number;
  parent_id: number | null;
  role: MessageRole;
  status: MessageStatus;
  blocks: Block[];
}

// ===== Search =====

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

export type WebSearchFn = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<SearchResultPayload[]>;

export interface MessageCitation {
  cite_index: number;
  url: string;
  title?: string;
  site_name?: string;
}

// ===== Built-in Tool Block Types =====

export interface WebSearchBlock
  extends Omit<ToolCallBlock, "tool_name" | "input" | "output"> {
  tool_name: "web_search";
  input: SearchQueryPayload[];
  output: SearchResultPayload[];
}

export function isWebSearchBlock(block: ToolCallBlock): block is WebSearchBlock {
  return block.tool_name === "web_search";
}
