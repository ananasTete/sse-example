import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChatConversation } from "@/features/chat/components/conversation/chat-conversation";
import { ChatConversationSkeleton } from "@/features/chat/components/conversation/chat-conversation-skeleton";
import { useChatPageController } from "@/features/chat/hooks/use-chat-page-controller";
import { chatHistoryKeys } from "@/features/chat/services/chat-history";
import type { ChatBootstrapPrompt } from "@/features/chat/services/chat-navigation-state";

export interface ChatPageProps {
  chatId: string;
  bootstrapPrompt?: ChatBootstrapPrompt | null;
}

export function ChatPage({ chatId, bootstrapPrompt = null }: ChatPageProps) {
  const queryClient = useQueryClient();
  const {
    initialMessages,
    phase,
    errorBannerMessage,
    conversationErrorMessage,
    onRetryLoad,
  } = useChatPageController({
    chatId,
    expectPersistedChat: !bootstrapPrompt,
  });

  const onConversationStart = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: chatHistoryKeys.all });
  }, [queryClient]);

  const shouldShowConversationSkeleton = phase === "hydrating";
  const shouldShowConversationError = phase === "error";

  return (
    <div className="h-full min-h-0 overflow-hidden">
      {errorBannerMessage ? (
        <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
          {errorBannerMessage}
        </div>
      ) : null}
      <div className="h-full min-h-0">
        {shouldShowConversationSkeleton ? (
          <ChatConversationSkeleton />
        ) : shouldShowConversationError ? (
          <div className="h-full flex items-center justify-center px-6">
            <div className="max-w-md text-center">
              <div className="text-sm text-red-700">
                {conversationErrorMessage ?? "Chat initialization failed"}
              </div>
              <button
                type="button"
                onClick={onRetryLoad}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <ChatConversation
            key={chatId}
            chatId={chatId}
            initialMessages={initialMessages}
            bootstrapPrompt={bootstrapPrompt}
            onConversationStart={onConversationStart}
          />
        )}
      </div>
    </div>
  );
}
