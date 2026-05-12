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
  ChatResponse,
  BlockRenderer,
  extractCitationsFromBlocks,
} from "@/lib/chat-core";
import type { ChatBlock, ChatMessage } from "../types";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isSending?: boolean;
}

interface ChatMessageItemProps {
  message: ChatMessage;
}

function getUserMessageText(message: ChatMessage) {
  return message.blocks
    .filter((f) => f.type === "request")
    .map((f) => f.content ?? "")
    .join("");
}

function AssistantBlocks({
  blocks,
  citations,
  isStreaming,
}: {
  blocks: ChatBlock[];
  citations: ReturnType<typeof extractCitationsFromBlocks>;
  isStreaming: boolean;
}) {
  const lastResponseId = blocks.findLast((f) => f.type === "response")?.id;

  return (
    <>
      {blocks.map((block) => {
        if (block.type === "response") {
          return (
            <ChatResponse
              key={block.id}
              citations={citations}
              isAnimating={isStreaming && block.id === lastResponseId}
            >
              {block.content ?? ""}
            </ChatResponse>
          );
        }

        return <BlockRenderer key={block.id} block={block} />;
      })}
    </>
  );
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
}: ChatMessageItemProps) {
  const isUser = message.role === "USER";
  const isStreaming = message.role === "ASSISTANT" && message.status === "WIP";
  const citations = isUser ? [] : extractCitationsFromBlocks(message.blocks);

  return (
    <Message
      from={isUser ? "user" : "assistant"}
      className={isUser ? "max-w-[78%]" : "max-w-full"}
    >
      <MessageContent
        className={
          isUser
            ? "rounded-[18px] rounded-tr-md bg-[#e8ebe4] px-4 py-2.5 text-[15px] leading-6 text-[#252820]"
            : "w-full max-w-none bg-transparent px-0 py-0 text-[15px] leading-7 text-[#252820]"
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

export function ChatMessageList({ messages, isSending }: ChatMessageListProps) {
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-5 py-8">
        {messages.length === 0 ? (
          <ConversationEmptyState
            title="开始对话"
            description=""
            className="min-h-[45vh] text-[#85877f]"
          />
        ) : null}

        {messages.map((message) => (
          <ChatMessageItem key={message.message_id} message={message} />
        ))}

        {isSending && messages.at(-1)?.role === "USER" ? (
          <div className="text-sm text-[#8b8d85]">思考中...</div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton className="bottom-5" />
    </Conversation>
  );
}
