import { Message, MessagePart } from "@/features/ai-sdk/hooks/use-chat/types";

export type MessageStatus = "done" | "streaming" | "aborted" | "error";

export interface ChatEntity {
  id: string;
  title: string | null;
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
}

export interface ListChatsResult {
  items: ChatSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UpdateChatInput {
  title?: string | null;
}

export interface CreateMessageInput {
  id: string;
  chatId: string;
  role: Message["role"];
  parts: MessagePart[];
  model?: string;
  status?: MessageStatus;
  createdAt?: string;
}

export interface UpdateMessageInput {
  parts?: MessagePart[];
  model?: string | null;
  status?: MessageStatus;
}

export interface ChatStore {
  createChat(input?: { id?: string; title?: string }): Promise<ChatEntity>;
  getChat(chatId: string): Promise<ChatEntity | null>;
  listChats(params?: ListChatsParams): Promise<ListChatsResult>;
  updateChat(chatId: string, input: UpdateChatInput): Promise<ChatEntity | null>;
  deleteChat(chatId: string): Promise<boolean>;
  listMessages(chatId: string): Promise<Message[]>;
  syncMessages(chatId: string, messages: Message[]): Promise<void>;
  createMessage(input: CreateMessageInput): Promise<Message>;
  updateMessage(
    chatId: string,
    messageId: string,
    input: UpdateMessageInput
  ): Promise<Message | null>;
  deleteMessage(chatId: string, messageId: string): Promise<boolean>;
}
