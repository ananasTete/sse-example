import type { Message, MessagePart } from "@/features/ai-sdk/hooks/use-chat/types";
import type { ChatEntity, ListChatsResult } from "@/lib/chat-store";
import type { ApiMessage } from "./contracts";

export const DEFAULT_USER_ID = "local-user";

interface FlatChatResponse {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
}

export interface FlatChatDetailResponse extends FlatChatResponse {
  messages: Message[];
}

export interface FlatChatHistoryResponse {
  items: Array<{
    id: string;
    title: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    lastMessagePreview: string | null;
    messageCount: number;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export function resolveRequestUserId(request: Request): string {
  const userId = request.headers.get("x-user-id")?.trim();
  return userId || DEFAULT_USER_ID;
}

export function toFlatChatResponse(chat: ChatEntity): FlatChatResponse {
  return {
    id: chat.id,
    title: chat.title ?? "",
    userId: chat.userId,
    createdAt: chat.createdAt,
  };
}

export function toFlatChatDetailResponse(
  chat: ChatEntity,
  messages: Message[],
): FlatChatDetailResponse {
  return {
    ...toFlatChatResponse(chat),
    messages,
  };
}

export function toFlatHistoryResponse(
  result: ListChatsResult,
): FlatChatHistoryResponse {
  return {
    items: result.items.map((item) => ({
      id: item.id,
      title: item.title,
      userId: item.userId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastMessagePreview: item.lastMessagePreview,
      messageCount: item.messageCount,
    })),
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}

export function toStoreMessage(chatId: string, message: ApiMessage): Message {
  return {
    id: message.id,
    chatId,
    role: message.role,
    parts: message.parts as MessagePart[],
    createdAt: message.createdAt,
    model: message.model,
  };
}
