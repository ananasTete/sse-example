export const CHAT_HISTORY_PAGE_SIZE = 20;

const CHAT_HISTORY_KEY = "chat-history";

export interface ChatHistoryItem {
  id: string;
  title: string;
  updatedAt: string;
  lastMessagePreview: string | null;
  messageCount: number;
}

export interface ChatHistoryResponse {
  items: ChatHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const chatHistoryKeys = {
  all: [CHAT_HISTORY_KEY] as const,
  list: (limit: number = CHAT_HISTORY_PAGE_SIZE) =>
    [CHAT_HISTORY_KEY, "list", limit] as const,
};

interface FetchChatHistoryPageInput {
  cursor?: string;
  limit?: number;
}

export async function fetchChatHistoryPage({
  cursor,
  limit = CHAT_HISTORY_PAGE_SIZE,
}: FetchChatHistoryPageInput = {}): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/chats?${params.toString()}`);
  if (!response.ok) {
    throw new Error("加载历史失败");
  }

  return (await response.json()) as ChatHistoryResponse;
}
