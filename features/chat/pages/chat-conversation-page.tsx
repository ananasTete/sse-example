import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChatConversation,
  type ChatStreamFinishedPayload,
} from "@/features/chat/components/conversation/chat-conversation";
import { ChatConversationSkeleton } from "@/features/chat/components/conversation/chat-conversation-skeleton";
import {
  chatDetailQueryOptions,
  ChatDetailError,
} from "@/features/chat/services/chat-detail";
import type { ConversationStateV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import {
  peekPendingChatAutoStart,
} from "../services/chat-session-auto-start";
import { useChatSessionOrchestrator } from "../hooks/use-chat-session-orchestrator";

interface ChatConversationPageProps {
  chatId?: string;
}

const createEmptyConversation = (chatId: string): ConversationStateV2 => {
  const rootId = `chat-root:${chatId}`;
  return {
    rootId,
    cursorId: rootId,
    mapping: {
      [rootId]: {
        id: rootId,
        parentId: null,
        childIds: [],
        role: "root",
        message: null,
        visible: false,
      },
    },
  };
};

export function ChatConversationPage({ chatId }: ChatConversationPageProps) {
  const queryClient = useQueryClient();
  const bootstrappedChatIdRef = useRef<string | null>(null);
  const bootstrappedAutoStartRef = useRef<ReturnType<typeof peekPendingChatAutoStart>>(null);
  const {
    status,
    error,
    createAndStartConversation,
    consumeAutoStart,
    markStreaming,
  } = useChatSessionOrchestrator();

  if ((chatId ?? null) !== bootstrappedChatIdRef.current) {
    bootstrappedChatIdRef.current = chatId ?? null;
    bootstrappedAutoStartRef.current = chatId
      ? peekPendingChatAutoStart(chatId)
      : null;
  }

  const bootstrappedAutoStart = bootstrappedAutoStartRef.current;
  const shouldFetchChatDetail = Boolean(chatId) && !bootstrappedAutoStart;

  const chatDetailQuery = useQuery({
    ...(chatId ? chatDetailQueryOptions(chatId) : chatDetailQueryOptions("")),
    enabled: shouldFetchChatDetail,
    retry: false,
  });

  const isNotFoundError =
    chatDetailQuery.error instanceof ChatDetailError &&
    chatDetailQuery.error.status === 404;

  const showConversationError =
    shouldFetchChatDetail &&
    Boolean(chatDetailQuery.error) &&
    !chatDetailQuery.data;

  const isLoadingHistory =
    shouldFetchChatDetail &&
    chatDetailQuery.isFetching &&
    !chatDetailQuery.data;

  const handleStreamFinished = useCallback(
    async ({
      isAbort,
      isDisconnect,
      isError,
    }: ChatStreamFinishedPayload) => {
      if (!chatId) return;
      consumeAutoStart(chatId);
      if (!isAbort && !isDisconnect && !isError) return;

      try {
        await queryClient.fetchQuery(chatDetailQueryOptions(chatId));
      } catch (streamRefreshError) {
        console.warn(
          "Failed to refresh chat detail after abnormal stream finish",
          streamRefreshError,
        );
      }
    },
    [chatId, consumeAutoStart, queryClient],
  );

  const initialConversation = chatId
    ? (bootstrappedAutoStart
      ? createEmptyConversation(chatId)
      : chatDetailQuery.data?.conversation ?? createEmptyConversation(chatId))
    : undefined;

  const autoStartModel = bootstrappedAutoStart?.model;
  const autoStartPrompt = bootstrappedAutoStart?.prompt;

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
        initialConversation={initialConversation}
        autoStartModel={autoStartModel}
        autoStartPrompt={autoStartPrompt}
        isCreatingChat={status === "creating" || status === "hydrating"}
        creationError={error}
        onCreateChat={createAndStartConversation}
        onStreamStateChange={markStreaming}
        onStreamFinished={handleStreamFinished}
      />
    </div>
  );
}
