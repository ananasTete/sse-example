import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChatPromptInput } from "./chat-prompt-input";
import {
  chatKeys,
  upsertChatSessionList,
  useChatCompletion,
  useDraftSession,
} from "../hooks";
import { useNavigate } from "@tanstack/react-router";

export function ChatIndexView() {
  const submitLockRef = useRef(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const {
    consume: consumeDraftSession,
    isLoading: isDraftSessionLoading,
    isFetching: isDraftSessionFetching,
  } = useDraftSession();

  const { mutateAsync: createCompletion, isPending: isSending } =
    useChatCompletion();

  const isSubmitting =
    isSending || isDraftSessionLoading || isDraftSessionFetching;

  const handleSubmit = useCallback(
    async (prompt: string, options: { searchEnabled: boolean }) => {
      if (submitLockRef.current || isSubmitting) return;

      submitLockRef.current = true;
      try {
        // 获取预创建会话
        const draftSession = await consumeDraftSession();

        // 创建本地会话镜像
        const targetChatSessionId = draftSession.chat_session.id;
        queryClient.setQueryData(chatKeys.session(targetChatSessionId), {
          chat_session: draftSession.chat_session,
          chat_messages: [],
        });

        // 乐观更新历史记录列表插入会话
        upsertChatSessionList(queryClient, draftSession);

        // 发起 SSE 请求
        const completionPromise = createCompletion({
          chatSessionId: targetChatSessionId,
          prompt,
          parentMessageId: draftSession.chat_session.current_message_id,
          searchEnabled: options.searchEnabled,
        });

        // 跳转到详情页
        await navigate({
          to: "/session-chat/$chat_session_id",
          params: { chat_session_id: targetChatSessionId },
          replace: true,
        });
        await completionPromise;
      } finally {
        submitLockRef.current = false;
      }
    },
    [createCompletion, consumeDraftSession, isSubmitting, queryClient],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-transparent px-4">
        <SidebarTrigger className="md:hidden" />
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 pb-24">
        <div className="w-full max-w-3xl">
          <div className="mb-7 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-[#252820] sm:text-4xl">
              有什么可以帮你？
            </h1>
          </div>
          <ChatPromptInput isSending={isSubmitting} onSubmit={handleSubmit} />
        </div>
      </main>
    </div>
  );
}
