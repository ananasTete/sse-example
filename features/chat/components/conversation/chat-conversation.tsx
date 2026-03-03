"use client";

import type { ConversationStateV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { BoundChatConversation } from "./chat-conversation-bound";
import { NewChatConversation } from "./chat-conversation-new";
import type { ChatStreamFinishedPayload } from "./chat-conversation.types";

export type { ChatStreamFinishedPayload } from "./chat-conversation.types";

interface ChatConversationProps {
  chatId?: string;
  initialConversation?: ConversationStateV2;
  autoStartModel?: string;
  autoStartPrompt?: string;
  isCreatingChat?: boolean;
  creationError?: Error | null;
  onCreateChat?: (text: string, model: string) => Promise<void>;
  onStreamStateChange?: (streaming: boolean) => void;
  onStreamFinished?: (payload: ChatStreamFinishedPayload) => Promise<void> | void;
}

export function ChatConversation(props: ChatConversationProps) {
  if (props.chatId && props.initialConversation) {
    return (
      <BoundChatConversation
        chatId={props.chatId}
        initialConversation={props.initialConversation}
        autoStartModel={props.autoStartModel}
        autoStartPrompt={props.autoStartPrompt}
        onStreamStateChange={props.onStreamStateChange}
        onStreamFinished={props.onStreamFinished}
      />
    );
  }

  return (
    <NewChatConversation
      isCreatingChat={Boolean(props.isCreatingChat)}
      creationError={props.creationError}
      onCreateChat={props.onCreateChat}
    />
  );
}
