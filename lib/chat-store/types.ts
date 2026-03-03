import {
  ChatMessageV2,
  ConversationStateV2,
  MessagePartV2,
  MessageRole,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";

export type MessageStatus = "done" | "streaming" | "aborted" | "error";

export interface ChatEntity {
  id: string;
  userId: string;
  title: string | null;
  cursorMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  }): Promise<ChatEntity>;
  getChat(chatId: string, userId?: string): Promise<ChatEntity | null>;
  listChats(params?: ListChatsParams): Promise<ListChatsResult>;
  updateChat(chatId: string, input: UpdateChatInput): Promise<ChatEntity | null>;
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
  ): Promise<ChatMessageV2 | null>;
  hideMessageSubtree(
    chatId: string,
    messageId: string,
  ): Promise<HideMessageSubtreeResult | null>;
}
