import { useMutation } from "@tanstack/react-query";
import { ChatCreateSessionResponse, DraftSession } from "../types";

export function parseDraftSession(
  response: ChatCreateSessionResponse,
): DraftSession {
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

export async function createChatSession(): Promise<DraftSession> {
  const response = await fetch("/api/v0/chat_session/create", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("创建会话失败");
  }

  return parseDraftSession(
    (await response.json()) as ChatCreateSessionResponse,
  );
}

export function useCreateChatSessionMutation() {
  return useMutation({
    mutationFn: createChatSession,
  });
}
