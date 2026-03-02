import { queryOptions } from "@tanstack/react-query";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";

const CHAT_DETAIL_KEY = "chat-detail";

export interface ChatDetailResponse {
  chat: {
    id: string;
  };
  messages?: Message[];
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

export async function fetchChatDetail(chatId: string): Promise<ChatDetailResponse> {
  const response = await fetch(`/api/chats/${chatId}`);
  if (!response.ok) {
    throw new ChatDetailError(response.status);
  }

  return (await response.json()) as ChatDetailResponse;
}

export const chatDetailQueryOptions = (chatId: string) =>
  queryOptions({
    queryKey: chatDetailKeys.detail(chatId),
    queryFn: () => fetchChatDetail(chatId),
  });
