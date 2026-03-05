export type PartState = "pending" | "streaming" | "done" | "error";

export type BlockType = "text" | "reasoning" | "tool_use" | "tool_result";

export type EventDelta =
  | { type: "text_delta"; text: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "citation_start_delta"; citation: Record<string, unknown> }
  | { type: "citation_end_delta"; citation_uuid: string };

export type MessagePart =
  | { type: "text"; text: string; state: PartState; citations?: Record<string, unknown>[] }
  | { type: "reasoning"; text: string; state: PartState }
  | { type: "tool_use"; tool_name: string; tool_use_id: string; input_json: string; input?: Record<string, unknown>; state: PartState }
  | { type: "tool_result"; tool_use_id?: string; content: Record<string, unknown>[]; is_error?: boolean; state: PartState };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  status: "in_progress" | "completed" | "error";
  stopReason: string | null;
  parts: MessagePart[];
  createdAt: string;
}

export interface ChatNode {
  id: string;
  parentId: string | null;
  childIds: string[]; // 包含所有子分支的 ID
  role: "root" | "user" | "assistant";
  message: ChatMessage | null;
}

export interface ChatTree {
  rootId: string;
  currentLeafId: string;
  mapping: Record<string, ChatNode>;
}

// —— 官方标准的 SSE 事件流定义 ——
export type StreamEvent =
  | { type: "message_start"; message: { id: string; role: "assistant" | "user" | "system"; parent_uuid?: string; model?: string } }
  | { type: "content_block_start"; index: number; content_block: { type: BlockType; name?: string; id?: string } } // id 通常对应 tool_use_id
  | { type: "content_block_delta"; index: number; delta: EventDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason?: string | null; stop_sequence?: string | null } }
  | { type: "message_stop" }
  | { type: "message_limit"; message_limit: { type: string; resetsAt?: number; remaining?: number; utilization?: number } }
  | { type: "error"; error: { type: string; message: string } };
