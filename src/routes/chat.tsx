import { useCallback } from "react";
import {
  Outlet,
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/features/chat/components/sidebar/chat-sidebar";

export const Route = createFileRoute("/chat")({
  component: ChatLayoutRoute,
});

function ChatLayoutRoute() {
  const navigate = useNavigate();
  const detailParams = useParams({
    from: "/chat/$chatId",
    shouldThrow: false,
  });
  const activeChatId = detailParams?.chatId ?? null;

  const onSelectChat = useCallback(
    (selectedChatId: string) => {
      if (!selectedChatId) return;
      if (selectedChatId === activeChatId) return;

      void navigate({
        to: "/chat/$chatId",
        params: { chatId: selectedChatId },
      });
    },
    [activeChatId, navigate],
  );

  const onCreateNewChat = useCallback(() => {
    if (!activeChatId) return;

    void navigate({
      to: "/chat",
    });
  }, [activeChatId, navigate]);

  return (
    <SidebarProvider defaultOpen>
      <ChatSidebar
        activeChatId={activeChatId}
        onSelectChat={onSelectChat}
        onCreateNewChat={onCreateNewChat}
      />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <div className="h-full min-h-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
