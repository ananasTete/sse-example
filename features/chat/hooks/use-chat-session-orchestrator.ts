import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { createChat } from "../services/chat-detail";
import { chatHistoryKeys } from "../services/chat-history";
import {
  setPendingChatAutoStart,
  takePendingChatAutoStart,
} from "../services/chat-session-auto-start";
import type { PendingChatAutoStart } from "../services/chat-session-auto-start";

export type ChatSessionStatus =
  | "idle"
  | "creating"
  | "hydrating"
  | "streaming"
  | "error";

const createChatId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const createMessageId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export function useChatSessionOrchestrator() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ChatSessionStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const createAndStartConversation = useCallback(
    async (prompt: string, model: string) => {
      const text = prompt.trim();
      if (!text) return;

      setError(null);
      setStatus("creating");
      const chatId = createChatId();
      const bootstrapUserMessage: Message = {
        id: createMessageId(),
        chatId,
        role: "user",
        parts: [{ type: "text", text, state: "done" }],
        createdAt: new Date().toISOString(),
      };

      try {
        await createChat({
          id: chatId,
          message: {
            id: bootstrapUserMessage.id,
            role: "user",
            parts: [{ type: "text", text }],
            createdAt: bootstrapUserMessage.createdAt,
          },
        });

        setStatus("hydrating");
        const historyRefreshPromise = queryClient
          .refetchQueries({
            queryKey: chatHistoryKeys.all,
            type: "all",
          })
          .catch((historyRefreshError) => {
            console.warn(
              "Failed to refresh chat history after chat creation",
              historyRefreshError,
            );
          });

        setPendingChatAutoStart({
          chatId,
          model,
          seedMessages: [bootstrapUserMessage],
        });

        const navigatePromise = navigate({
          to: "/chat/$chatId",
          params: { chatId },
        });
        await navigatePromise;

        void historyRefreshPromise;

        setStatus("idle");
      } catch (unknownError) {
        const nextError =
          unknownError instanceof Error
            ? unknownError
            : new Error(String(unknownError));
        setError(nextError);
        setStatus("error");
      }
    },
    [navigate, queryClient],
  );

  const consumeAutoStart = useCallback(
    (chatId: string): PendingChatAutoStart | null => takePendingChatAutoStart(chatId),
    [],
  );

  const markStreaming = useCallback((streaming: boolean) => {
    setStatus((previousStatus) => {
      if (streaming) return "streaming";
      if (previousStatus === "streaming") return "idle";
      return previousStatus;
    });
  }, []);

  return {
    status,
    error,
    createAndStartConversation,
    consumeAutoStart,
    markStreaming,
  };
}
