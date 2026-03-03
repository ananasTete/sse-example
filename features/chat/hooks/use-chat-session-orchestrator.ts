import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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

      try {
        await createChat({
          id: chatId,
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
          prompt: text,
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
