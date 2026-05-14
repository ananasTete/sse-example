"use client";

import { useCallback, useEffect, useRef } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChatMessageList } from "./chat-message-list";
import { ChatPromptInput } from "./chat-prompt-input";
import {
  useChatCompletion,
  useChatSessionQuery,
  useResumeChatCompletion,
} from "../hooks";

interface ChatDetailViewProps {
  chatSessionId: string;
}

function getSessionTitle(title: string | null | undefined) {
  return title?.trim() || "新会话";
}

export function ChatDetailView({ chatSessionId }: ChatDetailViewProps) {
  const submitLockRef = useRef(false);

  // 获取会话历史
  const sessionQuery = useChatSessionQuery(chatSessionId);

  // 发起新消息
  const { mutateAsync: createCompletion, isPending: isSending } =
    useChatCompletion();

  // resume 旧消息
  const { mutate: resumeCompletion, isPending: isResuming } =
    useResumeChatCompletion();

  const chatState = sessionQuery.data;
  const resumeKeyRef = useRef<string | null>(null);
  const autoResumeCheckedSessionRef = useRef<string | null>(null);

  const handleSubmit = useCallback(
    async (prompt: string, options: { searchEnabled: boolean }) => {
      if (submitLockRef.current || isSending) return;

      submitLockRef.current = true;
      try {
        await createCompletion({
          chatSessionId,
          prompt,
          parentMessageId: chatState?.chat_session.current_message_id ?? null,
          searchEnabled: options.searchEnabled,
        });
      } finally {
        submitLockRef.current = false;
      }
    },
    [
      chatSessionId,
      chatState?.chat_session.current_message_id,
      createCompletion,
      isSending,
    ],
  );

  const messages = chatState?.chat_messages ?? [];
  const activeAssistantMessage = messages.findLast(
    (message) => message.role === "ASSISTANT" && message.status === "WIP",
  );

  useEffect(() => {
    autoResumeCheckedSessionRef.current = null;
    resumeKeyRef.current = null;
  }, [chatSessionId]);

  useEffect(() => {
    if (!sessionQuery.isSuccess || !chatState) return;
    if (autoResumeCheckedSessionRef.current === chatSessionId) return;

    autoResumeCheckedSessionRef.current = chatSessionId;
    if (!activeAssistantMessage) return;

    const resumeKey = `${chatSessionId}:${activeAssistantMessage.message_id}`;
    if (resumeKeyRef.current === resumeKey) return;

    resumeKeyRef.current = resumeKey;
    resumeCompletion(
      {
        chatSessionId,
        messageId: activeAssistantMessage.message_id,
      },
      {
        onError: () => {},
      },
    );
  }, [
    activeAssistantMessage,
    chatSessionId,
    chatState,
    resumeCompletion,
    sessionQuery.isSuccess,
  ]);

  const title = getSessionTitle(chatState?.chat_session.title);
  const isLoadingDetail = sessionQuery.isFetching && !sessionQuery.data;
  const isStreaming = isSending || isResuming;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] bg-[#fbfbf8]/90 px-4 backdrop-blur">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-[#242821]">
          {title}
        </div>
      </header>

      {isLoadingDetail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#85877f]">
          加载中
        </div>
      ) : sessionQuery.error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-700">
          {sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : "加载失败"}
        </div>
      ) : (
        <>
          <ChatMessageList messages={messages} isSending={isStreaming} />
          <div className="shrink-0 bg-gradient-to-t from-[#fbfbf8] via-[#fbfbf8] to-transparent px-4 pb-5 pt-3">
            <div className="mx-auto w-full max-w-3xl">
              <ChatPromptInput
                disabled={!chatState}
                isSending={isStreaming}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
