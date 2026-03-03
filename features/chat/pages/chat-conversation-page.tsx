import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { ChatConversation } from "@/features/chat/components/conversation/chat-conversation";
import { ChatConversationSkeleton } from "@/features/chat/components/conversation/chat-conversation-skeleton";
import {
  chatDetailKeys,
  chatDetailQueryOptions,
  type ChatDetailResponse,
  ChatDetailError,
} from "@/features/chat/services/chat-detail";
import { type PendingChatAutoStart } from "../services/chat-session-auto-start";
import { useChatSessionOrchestrator } from "../hooks/use-chat-session-orchestrator";

interface ChatConversationPageProps {
  chatId?: string;
}

export function ChatConversationPage({ chatId }: ChatConversationPageProps) {
  const queryClient = useQueryClient();
  const [pendingAutoStart, setPendingAutoStart] =
    useState<PendingChatAutoStart | null>(null);
  const consumedAutoStartChatIdRef = useRef<string | null>(null);
  const {
    status,
    error,
    createAndStartConversation,
    consumeAutoStart,
    markStreaming,
  } = useChatSessionOrchestrator();

  useEffect(() => {
    if (!chatId) {
      consumedAutoStartChatIdRef.current = null;
      setPendingAutoStart(null);
      return;
    }

    if (consumedAutoStartChatIdRef.current === chatId) {
      return;
    }

    consumedAutoStartChatIdRef.current = chatId;
    setPendingAutoStart(consumeAutoStart(chatId));
  }, [chatId, consumeAutoStart]);

  const chatDetailQuery = useQuery({
    ...(chatId ? chatDetailQueryOptions(chatId) : chatDetailQueryOptions("")),
    enabled: Boolean(chatId),
    retry: false,
  });

  const isNotFoundError =
    chatDetailQuery.error instanceof ChatDetailError &&
    chatDetailQuery.error.status === 404;

  const showConversationError =
    Boolean(chatId) &&
    Boolean(chatDetailQuery.error) &&
    !chatDetailQuery.data;
  const isLoadingHistory =
    Boolean(chatId) &&
    chatDetailQuery.isFetching &&
    !chatDetailQuery.data;

  const handleStreamFinished = useCallback(
    async (messages: Message[]) => {
      if (!chatId) return;

      queryClient.setQueryData<ChatDetailResponse | undefined>(
        chatDetailKeys.detail(chatId),
        (previous) =>
          previous
            ? {
                ...previous,
                messages,
              }
            : previous,
      );

      try {
        await queryClient.invalidateQueries({
          queryKey: chatDetailKeys.detail(chatId),
          refetchType: "active",
        });
      } catch (streamRefreshError) {
        console.warn("Failed to refresh chat detail after stream finish", streamRefreshError);
      }
    },
    [chatId, queryClient],
  );

  if (isLoadingHistory) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <ChatConversationSkeleton />
      </div>
    );
  }

  if (showConversationError) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <div className="h-full flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="text-sm text-red-700">
              {isNotFoundError
                ? "会话不存在"
                : (chatDetailQuery.error instanceof Error
                    ? chatDetailQuery.error.message
                    : "加载会话失败")}
            </div>
            <button
              type="button"
              onClick={() => chatDetailQuery.refetch()}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ChatConversation
        key={chatId ?? "new-chat"}
        chatId={chatId}
        initialMessages={chatDetailQuery.data?.messages ?? []}
        autoStartModel={
          chatId && pendingAutoStart?.chatId === chatId
            ? pendingAutoStart.model
            : undefined
        }
        isCreatingChat={status === "creating" || status === "hydrating"}
        creationError={error}
        onCreateChat={createAndStartConversation}
        onStreamStateChange={markStreaming}
        onStreamFinished={handleStreamFinished}
      />
    </div>
  );
}
