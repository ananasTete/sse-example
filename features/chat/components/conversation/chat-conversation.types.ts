import type {
  ChatMessageV2,
  ConversationStateV2,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";

export interface ChatStreamFinishedPayload {
  messages: ChatMessageV2[];
  conversation: ConversationStateV2;
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}
