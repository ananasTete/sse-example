import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentChatKeys } from "./keys";
import type {
  AgentChatState,
  AgentHistoryMessagesResponse,
} from "../types";

export async function fetchAgentChatSession(
  chatSessionId: string,
): Promise<AgentChatState> {
  const response = await fetch(
    `/api/agent-editor/chat/history_messages?chat_session_id=${encodeURIComponent(
      chatSessionId,
    )}`,
  );

  if (!response.ok) {
    throw new Error("加载会话失败");
  }

  const body = (await response.json()) as AgentHistoryMessagesResponse;
  const chatState = body.data?.biz_data;

  if (!chatState?.chat_session) {
    throw new Error("会话详情响应无效");
  }

  return chatState;
}

export function useAgentChatSessionQuery(
  chatSessionId: string | null,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const queryKey = agentChatKeys.session(chatSessionId ?? "");
  const hasCachedSession = Boolean(
    chatSessionId && queryClient.getQueryData<AgentChatState>(queryKey),
  );

  return useQuery({
    queryKey,
    queryFn: () => fetchAgentChatSession(chatSessionId ?? ""),
    enabled:
      Boolean(chatSessionId) && !hasCachedSession && (options.enabled ?? true),
    staleTime: Infinity,
    retry: false,
  });
}
