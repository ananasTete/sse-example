"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChatV2 } from "@/features/ai-sdk/hooks/use-chat-v2/useChatV2";
import type {
  ChatMessageV2,
  ConversationNode,
  ConversationStateV2,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { registerActiveChatStreamController } from "@/features/chat/services/chat-stream-controller";
import { updateCurrentLeafMessage } from "@/features/chat/services/chat-detail";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationMessages } from "./chat-conversation-messages";
import { ChatConversationInput } from "./chat-conversation-input";

export interface ChatStreamFinishedPayload {
  messages: ChatMessageV2[];
  conversation: ConversationStateV2;
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

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

const DEFAULT_MODEL = "openai/gpt-5-nano";
type VariantDirection = "prev" | "next";

interface AssistantVariantIndicator {
  index: number;
  total: number;
}

const toTimestamp = (node: ConversationNode | undefined): number => {
  if (!node?.message?.createdAt) return 0;
  const parsed = Date.parse(node.message.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const compareNodesDesc = (
  mapping: ConversationStateV2["mapping"],
  leftId: string,
  rightId: string,
) => {
  const leftNode = mapping[leftId];
  const rightNode = mapping[rightId];
  const timeDiff = toTimestamp(rightNode) - toTimestamp(leftNode);
  if (timeDiff !== 0) return timeDiff;
  return rightId.localeCompare(leftId);
};

const resolveVisibleLeafFromAssistant = (
  conversation: ConversationStateV2,
  assistantId: string,
): string => {
  const startNode = conversation.mapping[assistantId];
  if (!startNode) return assistantId;

  const queue: string[] = [assistantId];
  const visited = new Set<string>();
  const leaves: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = conversation.mapping[nodeId];
    if (!node) continue;

    const visibleChildren = node.childIds.filter((childId) => {
      const childNode = conversation.mapping[childId];
      return Boolean(childNode && childNode.visible);
    });

    if (visibleChildren.length === 0) {
      leaves.push(nodeId);
      continue;
    }

    queue.push(...visibleChildren);
  }

  if (leaves.length === 0) return assistantId;

  return [...leaves].sort((leftId, rightId) =>
    compareNodesDesc(conversation.mapping, leftId, rightId),
  )[0];
};

const resolveAssistantVariantIds = (
  conversation: ConversationStateV2,
  assistantId: string,
): string[] => {
  const assistantNode = conversation.mapping[assistantId];
  if (!assistantNode || assistantNode.role !== "assistant" || !assistantNode.parentId) {
    return [];
  }

  const parentUserNode = conversation.mapping[assistantNode.parentId];
  if (!parentUserNode || parentUserNode.role !== "user") {
    return [];
  }

  return parentUserNode.childIds.filter((childId) => {
    const childNode = conversation.mapping[childId];
    return Boolean(childNode && childNode.role === "assistant" && childNode.visible);
  });
};

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

interface BoundChatConversationProps {
  chatId: string;
  initialConversation: ConversationStateV2;
  autoStartModel?: string;
  autoStartPrompt?: string;
  onStreamStateChange?: (streaming: boolean) => void;
  onStreamFinished?: (payload: ChatStreamFinishedPayload) => Promise<void> | void;
}

function BoundChatConversation({
  chatId,
  initialConversation,
  autoStartModel,
  autoStartPrompt,
  onStreamStateChange,
  onStreamFinished,
}: BoundChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState(autoStartModel ?? DEFAULT_MODEL);
  const [forcedParentAssistantId, setForcedParentAssistantId] = useState<string | null>(null);
  const hasAutoStartedRef = useRef(false);

  const {
    activeMessages,
    conversation,
    input,
    handleInputChange,
    handleSubmit,
    error,
    isLoading,
    stop,
    regenerate,
    sendMessage,
    setCursor,
    setInput,
  } = useChatV2({
    api: "/api/chats",
    chatId,
    model: selectedModel,
    initialConversation,
    onFinish: ({
      isAbort,
      isDisconnect,
      isError,
      messages: completedMessages,
      conversation: completedConversation,
    }) => {
      void onStreamFinished?.({
        messages: completedMessages,
        conversation: completedConversation,
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
    if (!autoStartModel || !autoStartPrompt?.trim()) return;

    if (selectedModel !== autoStartModel) {
      setSelectedModel(autoStartModel);
      return;
    }

    const startTimer = window.setTimeout(() => {
      if (hasAutoStartedRef.current) return;
      hasAutoStartedRef.current = true;
      void sendMessage(autoStartPrompt, { trigger: "submit-message" });
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
    };
  }, [autoStartModel, autoStartPrompt, selectedModel, sendMessage]);

  const submitCurrentInput = async () => {
    if (!input.trim()) return;

    const forcedParentId = forcedParentAssistantId;
    if (forcedParentId && conversation.mapping[forcedParentId]) {
      const messageText = input;
      setInput("");
      setForcedParentAssistantId(null);
      await sendMessage(messageText, {
        parentId: forcedParentId,
        trigger: "submit-message",
      });
      return;
    }

    await handleSubmit();
  };

  const assistantVariantIndicators = activeMessages.reduce<Record<string, AssistantVariantIndicator>>(
    (acc, message) => {
      if (message.role !== "assistant") return acc;

      const variantIds = resolveAssistantVariantIds(conversation, message.id);
      if (variantIds.length <= 1) return acc;

      const currentIndex = variantIds.indexOf(message.id);
      if (currentIndex === -1) return acc;

      acc[message.id] = {
        index: currentIndex + 1,
        total: variantIds.length,
      };
      return acc;
    },
    {},
  );

  const switchAssistantVariant = useCallback(
    (assistantMessageId: string, direction: VariantDirection) => {
      const variantIds = resolveAssistantVariantIds(conversation, assistantMessageId);
      if (variantIds.length <= 1) return;

      const currentIndex = variantIds.indexOf(assistantMessageId);
      if (currentIndex === -1) return;

      const targetIndex =
        direction === "prev"
          ? (currentIndex - 1 + variantIds.length) % variantIds.length
          : (currentIndex + 1) % variantIds.length;
      const targetAssistantId = variantIds[targetIndex];
      const targetCursorId = resolveVisibleLeafFromAssistant(
        conversation,
        targetAssistantId,
      );

      setCursor(targetCursorId);
      setForcedParentAssistantId(targetAssistantId);
      void updateCurrentLeafMessage(chatId, targetCursorId).catch((error) => {
        console.warn("Failed to persist current leaf message id", error);
      });
    },
    [chatId, conversation, setCursor],
  );

  useEffect(() => {
    if (!forcedParentAssistantId) return;
    if (conversation.mapping[forcedParentAssistantId]) return;
    setForcedParentAssistantId(null);
  }, [conversation, forcedParentAssistantId]);

  useEffect(() => {
    if (!isLoading) return;
    setForcedParentAssistantId(null);
  }, [isLoading]);

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
          messages={activeMessages}
          isHeroMode={false}
          isLoading={isLoading}
          onRegenerateAssistant={(assistantMessageId) => {
            void regenerate({ assistantMessageId });
          }}
          assistantVariantIndicators={assistantVariantIndicators}
          onSwitchAssistantVariant={(assistantMessageId, direction) => {
            switchAssistantVariant(assistantMessageId, direction);
          }}
          onRegenerateUser={(userMessageId, newContent) => {
            const targetUserNode = conversation.mapping[userMessageId];
            if (
              !targetUserNode ||
              targetUserNode.role !== "user" ||
              !targetUserNode.parentId
            ) {
              console.warn("User node not found or has no parent", userMessageId);
              return;
            }

            void sendMessage(newContent, {
              parentId: targetUserNode.parentId,
              trigger: "submit-message",
            });
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
