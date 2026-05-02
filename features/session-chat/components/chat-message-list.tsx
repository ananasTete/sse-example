"use client";

import { memo } from "react";
import { ExternalLink, Search } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/src/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  type MessageCitation,
} from "@/src/components/ai-elements/message";
import { getChatMessageText } from "../stream/stream";
import type { ChatFragment, ChatMessage } from "../types";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isSending?: boolean;
}

interface ChatMessageItemProps {
  message: ChatMessage;
}

function getStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getNumberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function getSearchFragments(message: ChatMessage) {
  return message.fragments.filter((fragment) => fragment.type === "SEARCH");
}

function getCitations(searchFragments: ChatFragment[]) {
  const citationByIndex = new Map<number, MessageCitation>();

  for (const fragment of searchFragments) {
    for (const result of fragment.results ?? []) {
      const citeIndex = getNumberField(result, "cite_index");
      const url = getStringField(result, "url");
      if (citeIndex !== null && url) {
        citationByIndex.set(citeIndex, {
          cite_index: citeIndex,
          url,
          title: getStringField(result, "title"),
          site_name: getStringField(result, "site_name"),
        });
      }
    }
  }

  return Array.from(citationByIndex.values()).sort(
    (a, b) => a.cite_index - b.cite_index,
  );
}

function SearchFragmentView({ fragment }: { fragment: ChatFragment }) {
  const queries = (fragment.queries ?? [])
    .map((query) => getStringField(query, "query"))
    .filter(Boolean);
  const results = (fragment.results ?? []).filter((result) =>
    Boolean(getStringField(result, "url")),
  );
  const isSearching = fragment.status !== "FINISHED";

  return (
    <div className="mb-4 rounded-lg border border-[#dfe4da] bg-[#f3f7f1] px-3 py-2.5 text-sm text-[#3e4639]">
      <div className="flex items-center gap-2 font-medium">
        <Search className="size-4 text-[#4f7f52]" />
        <span>{isSearching ? "正在搜索" : "网络搜索"}</span>
      </div>

      {queries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {queries.map((query, index) => (
            <span
              key={`${query}-${index}`}
              className="rounded-full bg-white px-2 py-1 text-xs text-[#596154]"
            >
              {query}
            </span>
          ))}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {results.map((result, index) => {
            const url = getStringField(result, "url");
            const title = getStringField(result, "title") || url;
            const siteName = getStringField(result, "site_name");
            const citeIndex = getNumberField(result, "cite_index");

            return (
              <a
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 rounded-md bg-white px-2.5 py-2 text-xs text-[#252820] hover:bg-[#edf2ea]"
              >
                <span className="shrink-0 text-[#4f7f52]">
                  {citeIndex ?? index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {siteName ? (
                  <span className="hidden shrink-0 text-[#85877f] sm:inline">
                    {siteName}
                  </span>
                ) : null}
                <ExternalLink className="size-3.5 shrink-0 text-[#85877f]" />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
}: ChatMessageItemProps) {
  const isUser = message.role === "USER";
  const isStreaming = message.role === "ASSISTANT" && message.status === "WIP";
  const searchFragments = isUser ? [] : getSearchFragments(message);
  const citations = isUser ? [] : getCitations(searchFragments);
  const text = getChatMessageText(message);

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
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <>
            {searchFragments.map((fragment) => (
              <SearchFragmentView key={fragment.id} fragment={fragment} />
            ))}
            <MessageResponse citations={citations} isAnimating={isStreaming}>
              {text}
            </MessageResponse>
          </>
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
