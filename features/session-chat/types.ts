import type {
  CoreMessage,
  MessageRole,
  MessageStatus,
  BlockStatus,
  PatchContext,
  PatchOp,
  ReadyPayload,
  TextBlock,
  ToolCallBlock,
  ReasoningBlock,
  WebSearchBlock,
} from "@/lib/chat-core";

export type { WebSearchBlock };
export { isWebSearchBlock } from "@/lib/chat-core";

export type ChatRole = MessageRole;
export type ChatTitleType = "WIP" | "SYSTEM" | "USER";
export type ChatMessageStatus = MessageStatus;
export type ChatBlockStatus = BlockStatus;

export type { MessageRole, MessageStatus, BlockStatus };

// ====================
// session
// ====================

export interface ChatSession {
  id: string;
  title: string | null;
  title_type: ChatTitleType;
  pinned: boolean;
  updated_at: number;
  seq_id: number;
  agent: string;
  version: number;
  is_empty: boolean;
  current_message_id: number | null;
  inserted_at: number;
}

export type ChatSessionPatch = Partial<ChatSession>;

export interface ChatSessionListItem {
  id: string;
  seq_id: number;
  title: string | null;
  title_type: ChatTitleType;
  pinned: boolean;
  updated_at: number;
}

export interface ChatState {
  chat_session: ChatSession;
  chat_messages: ChatMessage[];
  cache_control?: string;
  cache_reset_at?: number;
}

export interface DraftSession {
  chat_session: ChatSession;
  ttl_seconds: number;
}

// ====================
// block
// ====================

export type { TextBlock, ReasoningBlock };
export type { ToolCallBlock as ChatToolCallBlock };

export type ChatMessageBlock = TextBlock | WebSearchBlock | ReasoningBlock;

// ====================
// message
// ====================

export interface ChatMessage extends CoreMessage {
  role: ChatRole;
  status: ChatMessageStatus;
  blocks: ChatMessageBlock[];
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

export interface ApiResponse<T = undefined> {
  code?: number;
  msg?: string;
  data?: {
    biz_code?: number;
    biz_msg?: string;
    biz_data?: T | null;
  };
}

// ====================
// other
// ====================

export type ChatCreateSessionResponse = ApiResponse<{
  chat_session?: ChatSession;
  ttl_seconds?: number;
}>;

export type ChatHistoryMessagesResponse = ApiResponse<ChatState>;

export type ChatSessionsPageResponse = ApiResponse<{
  chat_sessions?: ChatSessionListItem[];
  has_more?: boolean;
  next_cursor?: ChatSessionsPageCursor | null;
}>;

export interface ChatSessionsPageCursor {
  updated_at: number;
  seq_id: number;
}

export interface ChatSessionsPage {
  items: ChatSessionListItem[];
  nextCursor: ChatSessionsPageCursor | null;
  hasMore: boolean;
}

export type ChatReadyEventPayload = ReadyPayload;

export type { PatchContext, PatchOp };

export interface ChatCompletionOptions {
  chatSessionId: string;
  prompt: string;
  parentMessageId: number | null;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  optimisticUserMessageId?: number;
}
