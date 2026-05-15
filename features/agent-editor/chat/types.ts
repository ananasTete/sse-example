import type {
  BlockStatus,
  CoreMessage,
  MessageRole,
  MessageStatus,
  PatchContext,
  PatchOp,
  ReadyPayload,
  ReasoningBlock,
  TextBlock,
  ToolCallBlock,
  WebSearchBlock,
} from "@/lib/chat-core";

export type AgentChatRole = MessageRole;
export type AgentChatTitleType = "WIP" | "SYSTEM" | "USER";
export type AgentChatMessageStatus = MessageStatus;
export type AgentChatBlockStatus = BlockStatus;

export type { MessageRole, MessageStatus, BlockStatus, WebSearchBlock };
export { isWebSearchBlock } from "@/lib/chat-core";

export interface AgentChatSession {
  id: string;
  title: string | null;
  title_type: AgentChatTitleType;
  pinned: boolean;
  updated_at: number;
  seq_id: number;
  agent: string;
  version: number;
  is_empty: boolean;
  current_message_id: number | null;
  inserted_at: number;
}

export type AgentChatSessionPatch = Partial<AgentChatSession>;

export interface AgentChatSessionListItem {
  id: string;
  seq_id: number;
  title: string | null;
  title_type: AgentChatTitleType;
  pinned: boolean;
  updated_at: number;
}

export type { TextBlock, ReasoningBlock };
export type { ToolCallBlock as AgentChatToolCallBlock };

export type AgentChatMessageBlock =
  | TextBlock
  | WebSearchBlock
  | ReasoningBlock;

export interface AgentChatMessage extends CoreMessage {
  role: AgentChatRole;
  status: AgentChatMessageStatus;
  blocks: AgentChatMessageBlock[];
  model: string;
  thinking_enabled: boolean;
  ban_edit: boolean;
  ban_regenerate: boolean;
  incomplete_message: string | null;
  accumulated_token_usage: number;
  feedback: unknown;
  inserted_at: number;
  search_enabled: boolean;
  conversation_mode?: string;
  has_pending_block: boolean;
  auto_continue: boolean;
}

export interface AgentChatState {
  chat_session: AgentChatSession;
  chat_messages: AgentChatMessage[];
  cache_control?: string;
  cache_reset_at?: number;
}

export interface AgentDraftSession {
  chat_session: AgentChatSession;
  ttl_seconds: number;
}

export interface AgentApiResponse<T = undefined> {
  code?: number;
  msg?: string;
  data?: {
    biz_code?: number;
    biz_msg?: string;
    biz_data?: T | null;
  };
}

export type AgentCreateSessionResponse = AgentApiResponse<{
  chat_session?: AgentChatSession;
  ttl_seconds?: number;
}>;

export type AgentHistoryMessagesResponse = AgentApiResponse<AgentChatState>;

export interface AgentChatSessionsPageCursor {
  updated_at: number;
  seq_id: number;
}

export interface AgentChatSessionsPage {
  items: AgentChatSessionListItem[];
  nextCursor: AgentChatSessionsPageCursor | null;
  hasMore: boolean;
}

export type AgentChatSessionsPageResponse = AgentApiResponse<{
  chat_sessions?: AgentChatSessionListItem[];
  has_more?: boolean;
  next_cursor?: AgentChatSessionsPageCursor | null;
}>;

export type AgentChatReadyEventPayload = ReadyPayload;

export type { PatchContext, PatchOp };

export interface AgentChatCompletionOptions {
  chatSessionId: string;
  prompt: string;
  parentMessageId: number | null;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  optimisticUserMessageId?: number;
}

// ============================================================
// Reference types（at_references）
// ============================================================

/**
 * 带选区标记的文档引用
 * content_with_selection 中用 <selection-start/> 和 <selection-end/> 标记选区范围
 */
export interface DocumentSelectionReference {
  type: "selection";
  /** 带选区标记的完整文档文本 */
  content_with_selection: string;
  /** true = 包含完整文档；false = 因文档过长而截断 */
  is_full_content: boolean;
  /** 来源文档 ID */
  origin_id: string;
  /** 来源类型 */
  origin_type: "document";
}

/** 顶层文档来源引用 */
export interface DocumentOriginReference {
  type: "document";
  id: string;
}

/** 未来可扩展：引用其他文档、文件等 */
export type AtReference = DocumentSelectionReference;

/** completion 请求的顶层 origin 字段 */
export type CompletionOrigin = DocumentOriginReference;
