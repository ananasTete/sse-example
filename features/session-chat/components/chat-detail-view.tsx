"use client";

import { useCallback, useRef } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChatMessageList } from "./chat-message-list";
import { ChatPromptInput } from "./chat-prompt-input";
import { useChatCompletion, useChatSessionQuery } from "../hooks";

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
  const { mutateAsync: createCompletion, isPending: isSending } =
    useChatCompletion();
  const chatState = sessionQuery.data;

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
  const title = getSessionTitle(chatState?.chat_session.title);
  const isLoadingDetail = sessionQuery.isFetching && !sessionQuery.data;

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
          <ChatMessageList messages={messages} isSending={isSending} />
          <div className="shrink-0 bg-gradient-to-t from-[#fbfbf8] via-[#fbfbf8] to-transparent px-4 pb-5 pt-3">
            <div className="mx-auto w-full max-w-3xl">
              <ChatPromptInput
                disabled={!chatState}
                isSending={isSending}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
