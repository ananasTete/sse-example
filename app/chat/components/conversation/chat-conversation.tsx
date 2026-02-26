"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChat } from "@/features/ai-sdk/hooks/use-chat/useChat";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationMessages } from "./chat-conversation-messages";
import { ChatConversationInput } from "./chat-conversation-input";

interface ChatConversationProps {
  chatId: string;
  initialMessages?: Message[];
  onConversationStart?: () => void;
}

export function ChatConversation({
  chatId,
  initialMessages = [],
  onConversationStart,
}: ChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState("gpt-3.5-turbo");
  const [hasStartedConversation, setHasStartedConversation] = useState(
    initialMessages.length > 0
  );
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    error,
    isLoading,
    stop,
    regenerate,
  } = useChat({
    api: "/api/chats",
    chatId,
    model: selectedModel,
    initialMessages,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const bottomSpacerHeight = 0;
  const isOverflowAnchorDisabled = false;
  const isPinningInProgress = false;
  const registerUserMessageRef: (
    messageId: string,
    node: HTMLDivElement | null
  ) => void = () => {};

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [input]);

  const submitCurrentInput = async () => {
    if (!input.trim()) return;

    if (!hasStartedConversation) {
      onConversationStart?.();
      setHasStartedConversation(true);
    }

    await handleSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentInput();
    }
  };

  const shouldRenderSubmittedPlaceholder =
    isPinningInProgress && status === "submitted";
  const isHeroMode =
    !hasStartedConversation &&
    messages.length === 0 &&
    status !== "submitted" &&
    status !== "streaming";

  return (
    <div className="flex h-screen flex-col bg-[#f9f8f6] font-sans text-slate-800">
      <ChatConversationHeader
        selectedModel={selectedModel}
        isLoading={isLoading}
        onModelChange={setSelectedModel}
      />

      <div
        className="grid min-h-0 flex-1 transition-[grid-template-rows] duration-300 ease-out"
        style={{
          gridTemplateRows: isHeroMode
            ? "minmax(0, 1fr) auto minmax(0, 1fr)"
            : "minmax(0, 1fr) auto 0fr",
        }}
      >
        <ChatConversationMessages
          messages={messages}
          isHeroMode={isHeroMode}
          isLoading={isLoading}
          shouldRenderSubmittedPlaceholder={shouldRenderSubmittedPlaceholder}
          bottomSpacerHeight={bottomSpacerHeight}
          scrollContainerRef={scrollContainerRef}
          messagesContentRef={messagesContentRef}
          isOverflowAnchorDisabled={isOverflowAnchorDisabled}
          registerUserMessageRef={registerUserMessageRef}
          onRegenerateAssistant={(assistantMessageId) => {
            void regenerate({ assistantMessageId });
          }}
          onRegenerateUser={(userMessageId, newContent) => {
            void regenerate({ userMessageId, newContent });
          }}
        />

        <ChatConversationInput
          input={input}
          isHeroMode={isHeroMode}
          isLoading={isLoading}
          error={error}
          textareaRef={textareaRef}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onSubmit={() => {
            void submitCurrentInput();
          }}
          onStop={stop}
        />

        <div aria-hidden className="pointer-events-none" />
      </div>
    </div>
  );
}
