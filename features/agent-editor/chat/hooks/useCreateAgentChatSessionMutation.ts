import { useMutation } from "@tanstack/react-query";
import type {
  AgentCreateSessionResponse,
  AgentDraftSession,
} from "../types";

export function parseAgentDraftSession(
  response: AgentCreateSessionResponse,
): AgentDraftSession {
  const bizData = response.data?.biz_data;
  const chatSession = bizData?.chat_session;

  if (!bizData || !chatSession?.id || typeof bizData.ttl_seconds !== "number") {
    throw new Error("创建会话响应无效");
  }

  return {
    chat_session: chatSession,
    ttl_seconds: bizData.ttl_seconds,
  };
}

export async function createAgentChatSession(): Promise<AgentDraftSession> {
  const response = await fetch("/api/agent-editor/chat_session/create", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("创建会话失败");
  }

  return parseAgentDraftSession(
    (await response.json()) as AgentCreateSessionResponse,
  );
}

export function useCreateAgentChatSessionMutation() {
  return useMutation({
    mutationFn: createAgentChatSession,
  });
}
