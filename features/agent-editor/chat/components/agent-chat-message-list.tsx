"use client";

import { memo } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/src/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
} from "@/src/components/ai-elements/message";
import {
  BlockRenderer,
  ChatResponse,
  extractCitationsFromBlocks,
} from "@/lib/chat-core";
import type {
  AgentChatMessage,
  AgentChatMessageBlock,
} from "../types";

interface AgentChatMessageListProps {
  messages: AgentChatMessage[];
  isSending?: boolean;
}

interface AgentChatMessageItemProps {
  message: AgentChatMessage;
}

function getUserMessageText(message: AgentChatMessage) {
  return message.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.content ?? "")
    .join("");
}

function AssistantBlocks({
  blocks,
  citations,
  isStreaming,
}: {
  blocks: AgentChatMessageBlock[];
  citations: ReturnType<typeof extractCitationsFromBlocks>;
  isStreaming: boolean;
}) {
  const lastTextIndex = blocks.reduce(
    (last, block, index) => (block.type === "text" ? index : last),
    -1,
  );

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <ChatResponse
              key={index}
              citations={citations}
              isAnimating={isStreaming && index === lastTextIndex}
            >
              {block.content ?? ""}
            </ChatResponse>
          );
        }

        return (
          <BlockRenderer
            key={index}
            block={block as unknown as Record<string, unknown> & { type: string }}
          />
        );
      })}
    </>
  );
}

const AgentChatMessageItem = memo(function AgentChatMessageItem({
  message,
}: AgentChatMessageItemProps) {
  const isUser = message.role === "USER";
  const isStreaming = message.role === "ASSISTANT" && message.status === "WIP";
  const citations = isUser
    ? []
    : extractCitationsFromBlocks(
        message.blocks as unknown as Array<
          Record<string, unknown> & { type: string }
        >,
      );

  return (
    <Message
      from={isUser ? "user" : "assistant"}
      className={isUser ? "max-w-[86%]" : "max-w-full"}
    >
      <MessageContent
        className={
          isUser
            ? "rounded-[16px] rounded-tr-md bg-[#e8ebe4] px-3.5 py-2 text-[14px] leading-6 text-[#252820]"
            : "w-full max-w-none bg-transparent px-0 py-0 text-[14px] leading-7 text-[#252820]"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{getUserMessageText(message)}</div>
        ) : (
          <AssistantBlocks
            blocks={message.blocks}
            citations={citations}
            isStreaming={isStreaming}
          />
        )}
      </MessageContent>
    </Message>
  );
});

export function AgentChatMessageList({
  messages,
  isSending,
}: AgentChatMessageListProps) {
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="w-full gap-6 px-4 py-6">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title="开始对话"
            description=""
            className="min-h-[42vh] text-[#85877f]"
          />
        ) : null}

        {messages.map((message) => (
          <AgentChatMessageItem key={message.message_id} message={message} />
        ))}

        {isSending && messages.at(-1)?.role === "USER" ? (
          <div className="text-sm text-[#8b8d85]">思考中...</div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton className="bottom-4" />
    </Conversation>
  );
}
