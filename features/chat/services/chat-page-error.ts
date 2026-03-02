import { ChatDetailError } from "@/features/chat/services/chat-detail";

interface DeriveChatPageErrorStateInput {
  isChatPersisted: boolean;
  error: unknown;
  hasData: boolean;
}

interface ChatPageErrorState {
  isNotFoundError: boolean;
  showConversationError: boolean;
  errorBannerMessage: string | null;
  conversationErrorMessage: string | null;
}

export function deriveChatPageErrorState({
  isChatPersisted,
  error,
  hasData,
}: DeriveChatPageErrorStateInput): ChatPageErrorState {
  const isNotFoundError =
    error instanceof ChatDetailError && error.status === 404;

  const resolvedMessage = isNotFoundError
    ? null
    : error instanceof Error
      ? error.message
      : error
        ? "Unknown error"
        : null;

  const showConversationError =
    isChatPersisted && Boolean(error) && !hasData && !isNotFoundError;

  const errorBannerMessage = showConversationError ? null : resolvedMessage;
  const conversationErrorMessage = showConversationError
    ? (resolvedMessage ?? "Chat initialization failed")
    : null;

  return {
    isNotFoundError,
    showConversationError,
    errorBannerMessage,
    conversationErrorMessage,
  };
}
