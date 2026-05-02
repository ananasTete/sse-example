export type ChatRole = "USER" | "ASSISTANT";
export type ChatTitleType = "WIP" | "SYSTEM" | "USER";
export type ChatMessageStatus = "WIP" | "FINISHED" | "FAILED";
export type ChatPatchOperation = "APPEND" | "SET" | "BATCH";

export interface ChatSession {
  id: string;
  title: string | null;
  title_type: ChatTitleType;
  model_type: string;
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
  model_type: string;
  updated_at: number;
}

export interface ChatFragment {
  id: number;
  type: "REQUEST" | "RESPONSE" | "SEARCH" | string;
  status?: string;
  content: string | null;
  queries?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  references?: Array<Record<string, unknown>>;
  stage_id?: number | null;
}

export interface ChatMessage {
  message_id: number;
  parent_id: number | null;
  model: string;
  role: ChatRole;
  thinking_enabled: boolean;
  ban_edit: boolean;
  ban_regenerate: boolean;
  status: ChatMessageStatus;
  incomplete_message: string | null;
  accumulated_token_usage: number;
  feedback: unknown;
  inserted_at: number;
  search_enabled: boolean;
  fragments: ChatFragment[];
  conversation_mode?: string;
  has_pending_fragment: boolean;
  auto_continue: boolean;
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

export interface ChatCreateSessionResponse {
  code?: number;
  msg?: string;
  data?: {
    biz_code?: number;
    biz_msg?: string;
    biz_data?: {
      chat_session?: ChatSession;
      ttl_seconds?: number;
    } | null;
  };
}

export interface ChatHistoryMessagesResponse {
  code?: number;
  msg?: string;
  data?: {
    biz_code?: number;
    biz_msg?: string;
    biz_data?: ChatState | null;
  };
}

export interface ChatSessionsPageResponse {
  code?: number;
  msg?: string;
  data?: {
    biz_code?: number;
    biz_msg?: string;
    biz_data?: {
      chat_sessions?: ChatSessionListItem[];
      has_more?: boolean;
      next_cursor?: ChatSessionsPageCursor | null;
    } | null;
  };
}

export interface ChatSessionsPageCursor {
  updated_at: number;
  seq_id: number;
}

export interface ChatSessionsPage {
  items: ChatSessionListItem[];
  nextCursor: ChatSessionsPageCursor | null;
  hasMore: boolean;
}

export interface ChatReadyEventPayload {
  request_message_id: number;
  response_message_id: number;
  model_type: string;
}

export interface ChatStreamPatchContext {
  responseMessageId: number | null;
  responseMessageIndex: number | null;
  lastPath: string | null;
  lastOperation: ChatPatchOperation | null;
}

export interface ChatCompletionOptions {
  chatSessionId: string;
  prompt: string;
  parentMessageId: number | null;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  optimisticUserMessageId?: number;
}

export interface ChatStreamPatch {
  p?: string;
  o?: ChatPatchOperation;
  v?: unknown;
}
