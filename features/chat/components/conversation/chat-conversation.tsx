"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChat } from "@/features/ai-sdk/hooks/use-chat/useChat";
import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { registerActiveChatStreamController } from "@/features/chat/services/chat-stream-controller";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationMessages } from "./chat-conversation-messages";
import { ChatConversationInput } from "./chat-conversation-input";

export interface ChatStreamFinishedPayload {
  messages: Message[];
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

interface ChatConversationProps {
  chatId?: string;
  initialMessages?: Message[];
  autoStartModel?: string;
  isCreatingChat?: boolean;
  creationError?: Error | null;
  onCreateChat?: (text: string, model: string) => Promise<void>;
  onStreamStateChange?: (streaming: boolean) => void;
  onStreamFinished?: (payload: ChatStreamFinishedPayload) => Promise<void> | void;
}

const DEFAULT_MODEL = "openai/gpt-5-nano";

export function ChatConversation(props: ChatConversationProps) {
  if (props.chatId) {
    return (
      <BoundChatConversation
        chatId={props.chatId}
        initialMessages={props.initialMessages}
        autoStartModel={props.autoStartModel}
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

interface BoundChatConversationProps {
  chatId: string;
  initialMessages?: Message[];
  autoStartModel?: string;
  onStreamStateChange?: (streaming: boolean) => void;
  onStreamFinished?: (payload: ChatStreamFinishedPayload) => Promise<void> | void;
}

function BoundChatConversation({
  chatId,
  initialMessages = [],
  autoStartModel,
  onStreamStateChange,
  onStreamFinished,
}: BoundChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState(autoStartModel ?? DEFAULT_MODEL);
  const hasAutoStartedRef = useRef(false);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    error,
    isLoading,
    stop,
    regenerate,
    streamFromMessages,
  } = useChat({
    api: "/api/chats",
    chatId,
    model: selectedModel,
    initialMessages,
    onFinish: ({ isAbort, isDisconnect, isError, messages: completedMessages }) => {
      void onStreamFinished?.({
        messages: completedMessages,
        isAbort,
        isDisconnect,
        isError,
      });
    },
  });

  useEffect(() => {
    onStreamStateChange?.(isLoading);
  }, [isLoading, onStreamStateChange]);

  useEffect(() => {
    return registerActiveChatStreamController(chatId, stop);
  }, [chatId, stop]);

  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    if (!autoStartModel) return;
    if (selectedModel !== autoStartModel) {
      setSelectedModel(autoStartModel);
      return;
    }
    if (initialMessages.length === 0) return;
    if (initialMessages.some((message) => message.role === "assistant")) return;

    const startTimer = window.setTimeout(() => {
      if (hasAutoStartedRef.current) return;
      hasAutoStartedRef.current = true;
      void streamFromMessages({
        messages: initialMessages,
        trigger: "submit-message",
      });
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
    };
  }, [autoStartModel, initialMessages, selectedModel, streamFromMessages]);

  const submitCurrentInput = async () => {
    if (!input.trim()) return;
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

interface NewChatConversationProps {
  isCreatingChat: boolean;
  creationError?: Error | null;
  onCreateChat?: (text: string, model: string) => Promise<void>;
}

function NewChatConversation({
  isCreatingChat,
  creationError,
  onCreateChat,
}: NewChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [input, setInput] = useState("");

  const submitCurrentInput = useCallback(async () => {
    const text = input.trim();
    if (!text || !onCreateChat) return;

    await onCreateChat(text, selectedModel);
  }, [input, onCreateChat, selectedModel]);

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
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatConversationMessages
          messages={[]}
          isHeroMode={false}
          isLoading={isCreatingChat}
          onRegenerateAssistant={() => {
            // noop for empty conversation
          }}
          onRegenerateUser={() => {
            // noop for empty conversation
          }}
        />
      </div>
      <div className="z-10 shrink-0">
        <ChatConversationInput
          input={input}
          isHeroMode={false}
          isLoading={isCreatingChat}
          error={creationError ?? null}
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
  );
}
