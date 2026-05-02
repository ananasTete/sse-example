import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "./keys";
import { ChatHistoryMessagesResponse, ChatState } from "../types";

export async function fetchChatSession(
  chatSessionId: string,
): Promise<ChatState> {
  const response = await fetch(
    `/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(
      chatSessionId,
    )}`,
  );

  if (!response.ok) {
    throw new Error("加载会话失败");
  }

  const body = (await response.json()) as ChatHistoryMessagesResponse;
  const chatState = body.data?.biz_data;

  if (!chatState?.chat_session) {
    throw new Error("会话详情响应无效");
  }

  return chatState;
}

export function useChatSessionQuery(
  chatSessionId: string | null,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const queryKey = chatKeys.session(chatSessionId ?? "");
  const hasCachedSession = Boolean(
    chatSessionId && queryClient.getQueryData<ChatState>(queryKey),
  );

  return useQuery({
    queryKey,
    queryFn: () => fetchChatSession(chatSessionId ?? ""),
    enabled:
      Boolean(chatSessionId) && !hasCachedSession && (options.enabled ?? true),
    staleTime: Infinity,
    retry: false,
  });
}
