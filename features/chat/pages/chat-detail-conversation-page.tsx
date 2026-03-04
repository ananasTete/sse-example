import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationStateV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { ChatConversationSkeleton } from "@/features/chat/components/conversation/chat-conversation-skeleton";
import { useDelayedVisibility } from "@/hooks/use-delayed-visibility";
import {
  chatDetailQueryOptions,
  ChatDetailError,
} from "@/features/chat/services/chat-detail";
import { BoundChatConversation } from "../components/conversation/chat-conversation-bound";
import { ChatStreamFinishedPayload } from "../components/conversation/chat-conversation.types";

interface ChatDetailConversationPageProps {
  chatId: string;
  isDraft?: boolean;
  onBeforeSend?: (input: {
    model: string;
    enabledWebSearch: boolean;
  }) => Promise<void>;
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
  isDraft = false,
  onBeforeSend,
}: ChatDetailConversationPageProps) {
  const queryClient = useQueryClient();
  const [
    conversationResetVersionByChatId,
    setConversationResetVersionByChatId,
  ] = useState<Record<string, number>>({});

  // 请求会话记录
  const chatDetailQuery = useQuery({
    ...chatDetailQueryOptions(chatId),
    retry: false,
    enabled: !isDraft, // isDraft 时不发起请求
  });

  // 首次拉取历史中且尚无缓存数据 -> 显示骨架屏
  const isLoadingHistory =
    !isDraft && chatDetailQuery.isFetching && !chatDetailQuery.data;

  const showLoadingSkeleton = useDelayedVisibility(isLoadingHistory, {
    delayMs: 160,
    minVisibleMs: 320,
  });

  // 拉取失败且没有任何可展示的缓存数据 -> 显示错误页
  const showConversationError =
    !isDraft && Boolean(chatDetailQuery.error) && !chatDetailQuery.data;

  // 进一步区分错误类型：404 给出专属文案"会话不存在"，其余显示通用错误信息
  // 仅在 showConversationError 为 true 时有意义
  const isNotFoundError =
    chatDetailQuery.error instanceof ChatDetailError &&
    chatDetailQuery.error.status === 404;

  // 流异常结束（用户中断 / 网络断连 / 服务报错）后，拉取最新历史并递增 resetVersion，
  // 使 BoundChatConversation 通过 key 变化完全重新挂载，以丢弃残留的流式状态。
  // 正常结束时 (!isAbort && !isDisconnect && !isError) 无需重置，直接返回。
  const handleStreamFinished = useCallback(
    async ({ isAbort, isDisconnect, isError }: ChatStreamFinishedPayload) => {
      if (!isAbort && !isDisconnect && !isError) return;

      try {
        const refreshed = await queryClient.fetchQuery(
          chatDetailQueryOptions(chatId),
        );
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

  // ── 传给子组件的初始值（fallback 到空对话，子组件内部再增量合并流式消息） ────────────
  const initialConversation =
    chatDetailQuery.data?.conversation ?? createEmptyConversation(chatId);
  const conversationResetVersion =
    conversationResetVersionByChatId[chatId] ?? 0; // 每次异常重置后 +1，驱动 key 变化
  const initialEnabledWebSearch =
    chatDetailQuery.data?.settings.enabled_web_search ?? false;
  const initialActiveRun = chatDetailQuery.data?.activeRun ?? null;

  if (isLoadingHistory) {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        {showLoadingSkeleton ? <ChatConversationSkeleton /> : null}
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
                : chatDetailQuery.error instanceof Error
                  ? chatDetailQuery.error.message
                  : "加载会话失败"}
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
      <h3>{isDraft ? "草稿" : "会话"}</h3>
      <BoundChatConversation
        key={`${chatId}:${conversationResetVersion}`}
        chatId={chatId}
        initialConversation={initialConversation}
        initialEnabledWebSearch={initialEnabledWebSearch}
        initialActiveRun={initialActiveRun}
        onBeforeSend={onBeforeSend}
        onStreamFinished={handleStreamFinished}
      />
    </div>
  );
}
