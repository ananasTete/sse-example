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
import type { UseEditorAgentReturn } from "../../types";
import type {
  AgentChatMessage,
  AgentChatMessageBlock,
  AgentChatToolCallBlock,
} from "../types";
import { ProposeEditsBlock } from "../../components/propose-edits-block";
import { ApplyEditBlock } from "../../components/apply-edit-block";
import type { ProposeEditsInput } from "@/src/server/session-chat/tools/propose-edits";
import type { ApplyEditInput } from "@/src/server/session-chat/tools/apply-edit";

interface AgentChatMessageListProps {
  messages: AgentChatMessage[];
  isSending?: boolean;
  sessionId: string;
  editorAgent: UseEditorAgentReturn;
  onRetryEdit: (toolCallId: string, editId: string) => void;
  /** 每次 apply/retry 后 bump，强制工具块 UI 重读 localStorage 状态 */
  uiTick?: number;
}

interface AgentChatMessageItemProps {
  message: AgentChatMessage;
  sessionId: string;
  editorAgent: UseEditorAgentReturn;
  onRetryEdit: (toolCallId: string, editId: string) => void;
  uiTick?: number;
}

function getUserMessageText(message: AgentChatMessage) {
  return message.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.content ?? "")
    .join("");
}

function isToolCallBlock(block: AgentChatMessageBlock): block is AgentChatToolCallBlock {
  return block.type === "tool_call";
}

function AssistantBlocks({
  message,
  blocks,
  citations,
  isStreaming,
  sessionId,
  editorAgent,
  onRetryEdit,
}: {
  message: AgentChatMessage;
  blocks: AgentChatMessageBlock[];
  citations: ReturnType<typeof extractCitationsFromBlocks>;
  isStreaming: boolean;
  sessionId: string;
  editorAgent: UseEditorAgentReturn;
  onRetryEdit: (toolCallId: string, editId: string) => void;
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

        if (isToolCallBlock(block)) {
          if (block.tool_name === "propose_edits") {
            const input = Array.isArray(block.input) && block.input.length > 0
              ? (block.input[0] as ProposeEditsInput)
              : { edits: [] };
            return (
              <ProposeEditsBlock
                key={index}
                toolCallId={block.tool_call_id}
                messageId={message.message_id}
                sessionId={sessionId}
                input={input}
                editor={editorAgent.editor}
                onRetry={onRetryEdit}
              />
            );
          }

          if (block.tool_name === "apply_edit") {
            const input = Array.isArray(block.input) && block.input.length > 0
              ? (block.input[0] as ApplyEditInput)
              : { edits: [] };
            return (
              <ApplyEditBlock
                key={index}
                toolCallId={block.tool_call_id}
                messageId={message.message_id}
                sessionId={sessionId}
                input={input}
                onRetry={onRetryEdit}
              />
            );
          }
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
  sessionId,
  editorAgent,
  onRetryEdit,
  uiTick: _uiTick, // 仅用于触发 memo 重渲染，不直接使用
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
            message={message}
            blocks={message.blocks}
            citations={citations}
            isStreaming={isStreaming}
            sessionId={sessionId}
            editorAgent={editorAgent}
            onRetryEdit={onRetryEdit}
          />
        )}
      </MessageContent>
    </Message>
  );
});

export function AgentChatMessageList({
  messages,
  isSending,
  sessionId,
  editorAgent,
  onRetryEdit,
  uiTick,
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
          <AgentChatMessageItem
            key={message.message_id}
            message={message}
            sessionId={sessionId}
            editorAgent={editorAgent}
            onRetryEdit={onRetryEdit}
            uiTick={uiTick}
          />
        ))}

        {isSending && messages.at(-1)?.role === "USER" ? (
          <div className="text-sm text-[#8b8d85]">思考中...</div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton className="bottom-4" />
    </Conversation>
  );
}
