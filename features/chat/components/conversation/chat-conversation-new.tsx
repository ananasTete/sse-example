"use client";

import {
  useCallback,
  useState,
  type KeyboardEvent,
} from "react";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationInput } from "./chat-conversation-input";

const DEFAULT_MODEL = "openai/gpt-5-nano";

interface NewChatConversationProps {
  isCreatingChat: boolean;
  creationError?: Error | null;
  onCreateChat?: (
    text: string,
    model: string,
    settings: { enabledWebSearch: boolean },
  ) => Promise<void>;
}

export function NewChatConversation({
  isCreatingChat,
  creationError,
  onCreateChat,
}: NewChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [input, setInput] = useState("");
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  const submitCurrentInput = useCallback(async () => {
    const text = input.trim();
    if (!text || !onCreateChat || isCreatingChat) return;

    await onCreateChat(text, selectedModel, {
      enabledWebSearch: isWebSearchEnabled,
    });
  }, [
    input,
    isCreatingChat,
    isWebSearchEnabled,
    onCreateChat,
    selectedModel,
  ]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void submitCurrentInput();
    },
    [submitCurrentInput],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f9f8f6] font-sans text-slate-800">
      <ChatConversationHeader
        selectedModel={selectedModel}
        isLoading={isCreatingChat}
        onModelChange={setSelectedModel}
      />
      <div className="min-h-0 flex-1 overflow-hidden px-4">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center">
          <div className="mb-8 text-center">
            <p className="text-5xl font-semibold tracking-tight text-stone-700 sm:text-6xl">
              What can I do for you?
            </p>
          </div>
          <ChatConversationInput
            input={input}
            isHeroMode
            isLoading={isCreatingChat}
            error={creationError ?? null}
            webSearchEnabled={isWebSearchEnabled}
            onWebSearchEnabledChange={setIsWebSearchEnabled}
            onInputChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            onSubmit={() => {
              void submitCurrentInput();
            }}
            onStop={() => {
              // no streaming to stop in /chat creation stage
            }}
          />
        </div>
      </div>
    </div>
  );
}
