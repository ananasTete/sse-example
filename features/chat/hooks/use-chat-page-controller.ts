import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { chatDetailQueryOptions } from "@/features/chat/services/chat-detail";
import { deriveChatPageErrorState } from "../services/chat-page-error";
import {
  deriveChatPagePhase,
  type ChatPagePhase,
} from "../services/chat-page-view-state";

export interface UseChatPageControllerInput {
  chatId: string;
  expectPersistedChat?: boolean;
}

export interface UseChatPageControllerResult {
  initialMessages: Message[];
  phase: ChatPagePhase;
  errorBannerMessage: string | null;
  conversationErrorMessage: string | null;
  onRetryLoad: () => void;
}

export function useChatPageController({
  chatId,
  expectPersistedChat = true,
}: UseChatPageControllerInput): UseChatPageControllerResult {
  const navigate = useNavigate();

  const chatDetailQuery = useQuery({
    ...chatDetailQueryOptions(chatId),
    retry: false,
  });

  const errorState = deriveChatPageErrorState({
    isChatPersisted: expectPersistedChat,
    error: chatDetailQuery.error,
    hasData: Boolean(chatDetailQuery.data),
  });

  useEffect(() => {
    if (!expectPersistedChat) return;
    if (!errorState.isNotFoundError) return;

    void navigate({
      to: "/chat",
      replace: true,
    });
  }, [errorState.isNotFoundError, expectPersistedChat, navigate]);

  const phase = deriveChatPagePhase({
    isChatDetailFetching: chatDetailQuery.isFetching,
    hasChatDetailData: Boolean(chatDetailQuery.data),
    showConversationError: errorState.showConversationError,
  });

  const onRetryLoad = useCallback(() => {
    void chatDetailQuery.refetch();
  }, [chatDetailQuery]);

  const initialMessages = chatDetailQuery.data?.messages ?? [];

  return useMemo(
    () => ({
      initialMessages,
      phase,
      errorBannerMessage: errorState.errorBannerMessage,
      conversationErrorMessage: errorState.conversationErrorMessage,
      onRetryLoad,
    }),
    [
      initialMessages,
      phase,
      errorState.errorBannerMessage,
      errorState.conversationErrorMessage,
      onRetryLoad,
    ],
  );
}
