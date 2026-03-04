import {
  ChatMessageV2,
  ConversationStateV2,
  MessagePartV2,
  MessageRole,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";

export type MessageStatus = "done" | "streaming" | "aborted" | "error";
export type ChatRunStatus = "running" | "done" | "aborted" | "error";

export interface ChatSettings {
  enabledWebSearch: boolean;
}

export interface ChatEntity {
  id: string;
  userId: string;
  title: string | null;
  cursorMessageId: string | null;
  settings: ChatSettings;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChatRunEntity {
  id: string;
  chatId: string;
  userId: string;
  assistantMessageId: string;
  parentMessageId: string | null;
  resumeToken: string;
  status: ChatRunStatus;
  lastEventSeq: number;
  lastPersistedSeq: number;
  lastError: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface ChatRunEventEntity {
  id: string;
  runId: string;
  seq: number;
  event: string;
  payload: unknown;
  createdAt: string;
}

export interface ChatSummary extends ChatEntity {
  title: string;
  messageCount: number;
  lastMessagePreview: string | null;
}

export interface ListChatsParams {
  limit?: number;
  cursor?: string;
  userId?: string;
}

export interface ListChatsResult {
  items: ChatSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UpdateChatInput {
  title?: string | null;
  cursorMessageId?: string | null;
  settings?: ChatSettings;
}

export interface CreateMessageInput {
  id: string;
  chatId: string;
  parentId?: string | null;
  role: MessageRole;
  parts: MessagePartV2[];
  model?: string;
  status?: MessageStatus;
  visible?: boolean;
  createdAt?: string;
}

export interface UpdateMessageInput {
  parts?: MessagePartV2[];
  model?: string | null;
  status?: MessageStatus;
  visible?: boolean;
}

export interface CreateChatRunInput {
  id: string;
  chatId: string;
  userId: string;
  assistantMessageId: string;
  parentMessageId?: string | null;
  resumeToken: string;
  status?: ChatRunStatus;
}

export interface UpdateChatRunProgressInput {
  lastPersistedSeq?: number;
  lastError?: string | null;
  lastHeartbeatAt?: string | null;
}

export interface HideMessageSubtreeResult {
  hiddenMessageIds: string[];
  cursorMessageId: string | null;
}

export interface ChatStore {
  createChat(input?: {
    id?: string;
    title?: string;
    userId?: string;
    cursorMessageId?: string | null;
    settings?: ChatSettings;
  }): Promise<ChatEntity>;
  getChat(chatId: string, userId?: string): Promise<ChatEntity | null>;
  listChats(params?: ListChatsParams): Promise<ListChatsResult>;
  updateChat(
    chatId: string,
    input: UpdateChatInput,
    userId?: string,
  ): Promise<ChatEntity | null>;
  deleteChat(chatId: string): Promise<boolean>;
  getConversation(chatId: string, userId?: string): Promise<ConversationStateV2 | null>;
  listMessages(chatId: string, userId?: string): Promise<ChatMessageV2[]>;
  appendUserNodeIfMissing(
    chatId: string,
    parentId: string | null,
    message: ChatMessageV2,
  ): Promise<void>;
  createMessage(input: CreateMessageInput): Promise<ChatMessageV2>;
  updateMessage(
    chatId: string,
    messageId: string,
    input: UpdateMessageInput,
    userId?: string,
  ): Promise<ChatMessageV2 | null>;
  hideMessageSubtree(
    chatId: string,
    messageId: string,
    userId?: string,
  ): Promise<HideMessageSubtreeResult | null>;
  createChatRun(input: CreateChatRunInput): Promise<ChatRunEntity>;
  getChatRun(runId: string, userId?: string): Promise<ChatRunEntity | null>;
  getActiveChatRun(chatId: string, userId?: string): Promise<ChatRunEntity | null>;
  completeChatRun(
    runId: string,
    status: Exclude<ChatRunStatus, "running">,
    userId?: string,
  ): Promise<ChatRunEntity | null>;
  updateChatRunProgress(
    runId: string,
    input: UpdateChatRunProgressInput,
    userId?: string,
  ): Promise<ChatRunEntity | null>;
  appendChatRunEvent(
    runId: string,
    event: string,
    payload: unknown,
    userId?: string,
  ): Promise<ChatRunEventEntity | null>;
  listChatRunEvents(
    runId: string,
    options?: {
      afterSeq?: number;
      limit?: number;
      userId?: string;
    },
  ): Promise<ChatRunEventEntity[]>;
}
