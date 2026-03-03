import { queryOptions } from "@tanstack/react-query";
import type { ConversationStateV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";

const CHAT_DETAIL_KEY = "chat-detail";

export interface CreateChatPayload {
  id: string;
  title?: string;
}

export interface ChatBaseResponse {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
}

export interface ChatDetailResponse extends ChatBaseResponse {
  conversation: ConversationStateV2;
}

interface ApiConversationStateV2 {
  rootId: string;
  current_leaf_message_id: string;
  mapping: ConversationStateV2["mapping"];
}

interface ApiChatDetailResponse extends ChatBaseResponse {
  conversation: ApiConversationStateV2;
}

export class ChatDetailError extends Error {
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Failed to load chat (${status})`);
    this.name = "ChatDetailError";
    this.status = status;
  }
}

export const chatDetailKeys = {
  all: [CHAT_DETAIL_KEY] as const,
  detail: (chatId: string) => [CHAT_DETAIL_KEY, chatId] as const,
};

export async function createChat(payload: CreateChatPayload): Promise<ChatBaseResponse> {
  const response = await fetch("/api/chats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ChatDetailError(response.status, "Failed to create chat");
  }

  return (await response.json()) as ChatBaseResponse;
}

export async function fetchChatDetail(chatId: string): Promise<ChatDetailResponse> {
  const response = await fetch(`/api/chats/${chatId}`);
  if (!response.ok) {
    throw new ChatDetailError(response.status);
  }

  const data = (await response.json()) as ApiChatDetailResponse;

  return {
    ...data,
    conversation: {
      rootId: data.conversation.rootId,
      cursorId: data.conversation.current_leaf_message_id,
      mapping: data.conversation.mapping,
    },
  };
}

export async function updateCurrentLeafMessage(
  chatId: string,
  currentLeafMessageId: string,
): Promise<ChatBaseResponse> {
  const response = await fetch(`/api/chats/${chatId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      current_leaf_message_id: currentLeafMessageId,
    }),
  });

  if (!response.ok) {
    throw new ChatDetailError(
      response.status,
      "Failed to persist current leaf message id",
    );
  }

  return (await response.json()) as ChatBaseResponse;
}

export const chatDetailQueryOptions = (chatId: string) =>
  queryOptions({
    queryKey: chatDetailKeys.detail(chatId),
    queryFn: () => fetchChatDetail(chatId),
  });
