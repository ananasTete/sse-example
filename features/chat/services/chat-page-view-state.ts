export type ChatPagePhase = "hydrating" | "error" | "ready";

interface DeriveChatPagePhaseInput {
  isChatDetailFetching: boolean;
  hasChatDetailData: boolean;
  showConversationError: boolean;
}

export function deriveChatPagePhase({
  isChatDetailFetching,
  hasChatDetailData,
  showConversationError,
}: DeriveChatPagePhaseInput): ChatPagePhase {
  if (showConversationError) {
    return "error";
  }

  if (!hasChatDetailData && isChatDetailFetching) {
    return "hydrating";
  }

  return "ready";
}
