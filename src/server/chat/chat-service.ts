import type {
  ConversationNode,
  ConversationStateV2,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";
import type { ChatEntity, ListChatsResult } from "@/lib/chat-store";

export const DEFAULT_USER_ID = "local-user";

interface FlatChatResponse {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
}

interface ApiConversationStateV2 {
  rootId: string;
  current_leaf_message_id: string;
  mapping: Record<string, ConversationNode>;
}

export interface FlatChatDetailResponse extends FlatChatResponse {
  conversation: ApiConversationStateV2;
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
  conversation: ConversationStateV2,
): FlatChatDetailResponse {
  return {
    ...toFlatChatResponse(chat),
    conversation: {
      rootId: conversation.rootId,
      current_leaf_message_id: conversation.cursorId,
      mapping: conversation.mapping,
    },
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
