import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { ConversationStateV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { ChatSidebar } from "@/features/chat/components/sidebar/chat-sidebar";
import { ChatDetailConversationPage } from "@/features/chat/pages/chat-detail-conversation-page";
import {
  chatDetailKeys,
  createChat,
} from "@/features/chat/services/chat-detail";
import { chatHistoryKeys } from "@/features/chat/services/chat-history";
import { stopActiveChatStream } from "@/features/chat/services/chat-stream-controller";
import { useSingleFlight } from "@/hooks/use-single-flight";

export const Route = createFileRoute("/chat")({
  component: ChatLayoutRoute,
});

const createChatId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const createEmptyConversation = (chatId: string): ConversationStateV2 => {
  const rootId = `chat-root:${chatId}`;
  return {
    rootId,
    cursorId: rootId,
    mapping: {
      [rootId]: {
        id: rootId,
        parentId: null,
        childIds: [],
        role: "root",
        message: null,
        visible: false,
      },
    },
  };
};

function ChatLayoutRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams({ from: "/chat/$chatId", shouldThrow: false });
  const activeChatId = params?.chatId ?? null;
  const [draftChatId, setDraftChatId] = useState(() => createChatId());

  const { run: runCreateDraftChat, reset: resetCreateDraftChat } =
    useSingleFlight(async (chatId: string, enabledWebSearch: boolean) => {
      const createdChat = await createChat({
        id: chatId,
        settings: {
          enabled_web_search: enabledWebSearch,
        },
      });

      queryClient.setQueryData(chatDetailKeys.detail(chatId), {
        ...createdChat,
        conversation: createEmptyConversation(chatId),
        activeRun: null,
      });

      const historyRefreshPromise = queryClient
        .refetchQueries({
          queryKey: chatHistoryKeys.all,
          type: "all",
        })
        .catch((historyRefreshError) => {
          console.warn(
            "Failed to refresh chat history after chat creation",
            historyRefreshError,
          );
        });

      await navigate({
        to: "/chat/$chatId",
        params: { chatId },
      });

      void historyRefreshPromise;
    });

  const ensureChatExistsBeforeSend = useCallback(
    async ({ enabledWebSearch }: { enabledWebSearch: boolean }) => {
      if (activeChatId) return;

      const pendingChatId = draftChatId;
      await runCreateDraftChat(pendingChatId, enabledWebSearch);
    },
    [activeChatId, draftChatId, runCreateDraftChat],
  );

  const shellChatId = activeChatId ?? draftChatId;

  return (
    <SidebarProvider defaultOpen>
      <ChatSidebar
        activeChatId={activeChatId}
        onSelectChat={(id) => {
          if (!id || id === activeChatId) return;
          stopActiveChatStream();
          void navigate({ to: "/chat/$chatId", params: { chatId: id } });
        }}
        onCreateNewChat={() => {
          stopActiveChatStream();
          resetCreateDraftChat();
          setDraftChatId(createChatId());
          void navigate({ to: "/chat" });
        }}
      />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <ChatDetailConversationPage
          chatId={shellChatId}
          isDraft={!activeChatId}
          onBeforeSend={ensureChatExistsBeforeSend}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
