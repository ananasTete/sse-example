"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useChat } from "@/features/ai-sdk/hooks/use-chat/useChat";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { consumeBootstrapPromptToken } from "@/features/chat/services/bootstrap-prompt-consumer";
import type { ChatBootstrapPrompt } from "@/features/chat/services/chat-navigation-state";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationMessages } from "./chat-conversation-messages";
import { ChatConversationInput } from "./chat-conversation-input";

interface ChatConversationProps {
  chatId: string;
  initialMessages?: Message[];
  bootstrapPrompt?: ChatBootstrapPrompt | null;
  onConversationStart?: () => void;
}

export function ChatConversation({
  chatId,
  initialMessages = [],
  bootstrapPrompt = null,
  onConversationStart,
}: ChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState("gpt-3.5-turbo");
  const [hasStartedConversation, setHasStartedConversation] = useState(
    initialMessages.length > 0,
  );
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    error,
    isLoading,
    stop,
    regenerate,
    sendMessage,
  } = useChat({
    api: "/api/chats",
    chatId,
    model: selectedModel,
    initialMessages,
  });

  useEffect(() => {
    if (!bootstrapPrompt) return;

    const promptText = bootstrapPrompt.text.trim();
    if (!promptText) return;

    if (!consumeBootstrapPromptToken(bootstrapPrompt.token)) return;

    if (!hasStartedConversation) {
      setHasStartedConversation(true);
      onConversationStart?.();
    }

    void sendMessage(promptText);
  }, [bootstrapPrompt, hasStartedConversation, onConversationStart, sendMessage]);

  const submitCurrentInput = async () => {
    if (!input.trim()) return;

    if (!hasStartedConversation) {
      setHasStartedConversation(true);
      onConversationStart?.();
    }

    await handleSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentInput();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f9f8f6] font-sans text-slate-800">
      <ChatConversationHeader
        selectedModel={selectedModel}
        isLoading={isLoading}
        onModelChange={setSelectedModel}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatConversationMessages
          messages={messages}
          isHeroMode={false}
          isLoading={isLoading}
          onRegenerateAssistant={(assistantMessageId) => {
            void regenerate({ assistantMessageId });
          }}
          onRegenerateUser={(userMessageId, newContent) => {
            void regenerate({ userMessageId, newContent });
          }}
        />
      </div>
      <div className="z-10 shrink-0">
        <ChatConversationInput
          input={input}
          isHeroMode={false}
          isLoading={isLoading}
          error={error}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onSubmit={() => {
            void submitCurrentInput();
          }}
          onStop={stop}
        />
      </div>
    </div>
  );
}
