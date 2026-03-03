import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationStateV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import {
  ChatConversation,
  type ChatStreamFinishedPayload,
} from "@/features/chat/components/conversation/chat-conversation";
import { ChatConversationSkeleton } from "@/features/chat/components/conversation/chat-conversation-skeleton";
import {
  chatDetailQueryOptions,
  ChatDetailError,
} from "@/features/chat/services/chat-detail";
import {
  takePendingChatAutoStart,
} from "../services/chat-session-auto-start";

interface ChatDetailConversationPageProps {
  chatId: string;
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

export function ChatDetailConversationPage({
  chatId,
}: ChatDetailConversationPageProps) {
  const queryClient = useQueryClient();
  const [conversationResetVersionByChatId, setConversationResetVersionByChatId] = useState<
    Record<string, number>
  >({});
  const bootstrappedChatIdRef = useRef<string | null>(null);
  const bootstrappedAutoStartRef = useRef<ReturnType<typeof takePendingChatAutoStart>>(null);

  if (chatId !== bootstrappedChatIdRef.current) {
    bootstrappedChatIdRef.current = chatId;
    // Consume once to guarantee "at most once" auto-start per pending entry.
    bootstrappedAutoStartRef.current = takePendingChatAutoStart(chatId);
  }

  const bootstrappedAutoStart = bootstrappedAutoStartRef.current;

  const chatDetailQuery = useQuery({
    ...chatDetailQueryOptions(chatId),
    retry: false,
  });

  const isNotFoundError =
    chatDetailQuery.error instanceof ChatDetailError &&
    chatDetailQuery.error.status === 404;
  const shouldSuppressQueryError =
    Boolean(bootstrappedAutoStart) &&
    !chatDetailQuery.data &&
    chatDetailQuery.isFetching;

  const showConversationError =
    Boolean(chatDetailQuery.error) &&
    !chatDetailQuery.data &&
    !shouldSuppressQueryError;

  const isLoadingHistory =
    !bootstrappedAutoStart &&
    chatDetailQuery.isFetching &&
    !chatDetailQuery.data;

  const handleStreamFinished = useCallback(
    async ({ isAbort, isDisconnect, isError }: ChatStreamFinishedPayload) => {
      if (!isAbort && !isDisconnect && !isError) return;

      try {
        const refreshed = await queryClient.fetchQuery(chatDetailQueryOptions(chatId));
        if (refreshed?.conversation) {
          setConversationResetVersionByChatId((current) => ({
            ...current,
            [chatId]: (current[chatId] ?? 0) + 1,
          }));
        }
      } catch (streamRefreshError) {
        console.warn(
          "Failed to refresh chat detail after abnormal stream finish",
          streamRefreshError,
        );
      }
    },
    [chatId, queryClient],
  );

  const initialConversation =
    chatDetailQuery.data?.conversation ?? createEmptyConversation(chatId);
  const conversationResetVersion = conversationResetVersionByChatId[chatId] ?? 0;
  const shouldApplyAutoStart = conversationResetVersion === 0;

  const autoStartModel = shouldApplyAutoStart ? bootstrappedAutoStart?.model : undefined;
  const autoStartPrompt = shouldApplyAutoStart ? bootstrappedAutoStart?.prompt : undefined;

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
        key={`${chatId}:${conversationResetVersion}`}
        chatId={chatId}
        initialConversation={initialConversation}
        autoStartModel={autoStartModel}
        autoStartPrompt={autoStartPrompt}
        onStreamFinished={handleStreamFinished}
      />
    </div>
  );
}
