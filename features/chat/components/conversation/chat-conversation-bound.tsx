"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useChatV2 } from "@/features/ai-sdk/hooks/use-chat-v2/useChatV2";
import type {
  ConversationNode,
  ConversationStateV2,
  RequestTrigger,
  StreamChatSettingsV2,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { registerActiveChatStreamController } from "@/features/chat/services/chat-stream-controller";
import {
  updateCurrentLeafMessage,
  type ChatActiveRunResponse,
} from "@/features/chat/services/chat-detail";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationInput } from "./chat-conversation-input";
import { ChatConversationMessages } from "./chat-conversation-messages";
import type { ChatStreamFinishedPayload } from "./chat-conversation.types";

const DEFAULT_MODEL = "openai/gpt-5-nano";
type VariantDirection = "prev" | "next";

interface AssistantVariantIndicator {
  index: number;
  total: number;
}

interface BoundChatConversationProps {
  chatId: string;
  initialConversation: ConversationStateV2;
  initialEnabledWebSearch?: boolean;
  initialActiveRun?: ChatActiveRunResponse | null;
  onBeforeSend?: (input: {
    model: string;
    enabledWebSearch: boolean;
  }) => Promise<void>;
  onStreamStateChange?: (streaming: boolean) => void;
  onStreamFinished?: (
    payload: ChatStreamFinishedPayload,
  ) => Promise<void> | void;
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
  if (
    !assistantNode ||
    assistantNode.role !== "assistant" ||
    !assistantNode.parentId
  ) {
    return [];
  }

  const parentUserNode = conversation.mapping[assistantNode.parentId];
  if (!parentUserNode || parentUserNode.role !== "user") {
    return [];
  }

  return parentUserNode.childIds.filter((childId) => {
    const childNode = conversation.mapping[childId];
    return Boolean(
      childNode && childNode.role === "assistant" && childNode.visible,
    );
  });
};

export function BoundChatConversation({
  chatId,
  initialConversation,
  initialEnabledWebSearch,
  initialActiveRun,
  onBeforeSend,
  onStreamStateChange,
  onStreamFinished,
}: BoundChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(
    initialEnabledWebSearch ?? false,
  );
  const [preflightError, setPreflightError] = useState<Error | null>(null);
  const [forcedParentAssistantId, setForcedParentAssistantId] = useState<
    string | null
  >(null);
  const streamSettings: StreamChatSettingsV2 = {
    enabled_web_search: isWebSearchEnabled,
  };

  const {
    activeMessages,
    conversation,
    input,
    handleInputChange,
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
    settings: streamSettings,
    initialConversation,
    initialActiveRun: initialActiveRun ?? undefined,
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

  const submitCurrentInput = async (
    messageText: string,
    trigger: RequestTrigger = "submit-message",
  ) => {
    const text = messageText.trim();
    if (!text) return;

    if (preflightError) {
      setPreflightError(null);
    }

    try {
      await onBeforeSend?.({
        model: selectedModel,
        enabledWebSearch: isWebSearchEnabled,
      });
    } catch (unknownError) {
      const nextError =
        unknownError instanceof Error
          ? unknownError
          : new Error(String(unknownError));
      setPreflightError(nextError);
      return;
    }

    const forcedParentId = forcedParentAssistantId;
    if (forcedParentId && conversation.mapping[forcedParentId]) {
      setInput("");
      setForcedParentAssistantId(null);
      await sendMessage(text, {
        parentId: forcedParentId,
        trigger,
      });
      return;
    }

    setInput("");
    await sendMessage(text, {
      trigger,
    });
  };

  const assistantVariantIndicators = activeMessages.reduce<
    Record<string, AssistantVariantIndicator>
  >((acc, message) => {
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
  }, {});

  const switchAssistantVariant = useCallback(
    (assistantMessageId: string, direction: VariantDirection) => {
      const variantIds = resolveAssistantVariantIds(
        conversation,
        assistantMessageId,
      );
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
      void updateCurrentLeafMessage(chatId, targetCursorId).catch(
        (streamError) => {
          console.warn(
            "Failed to persist current leaf message id",
            streamError,
          );
        },
      );
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

  useEffect(() => {
    setIsWebSearchEnabled(initialEnabledWebSearch ?? false);
  }, [chatId, initialEnabledWebSearch]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentInput(input);
    }
  };

  const handleComposerInputChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    if (preflightError) {
      setPreflightError(null);
    }
    handleInputChange(event);
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
              console.warn(
                "User node not found or has no parent",
                userMessageId,
              );
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
          isLoading={isLoading}
          error={preflightError ?? error}
          webSearchEnabled={isWebSearchEnabled}
          onWebSearchEnabledChange={setIsWebSearchEnabled}
          onInputChange={handleComposerInputChange}
          onKeyDown={handleKeyDown}
          onSubmit={() => {
            void submitCurrentInput(input);
          }}
          onStop={stop}
        />
      </div>
    </div>
  );
}
