import { Outlet, createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ChatSidebar } from "@/features/chat/components/sidebar/chat-sidebar";
import { stopActiveChatStream } from "@/features/chat/services/chat-stream-controller";

export const Route = createFileRoute("/chat")({
  component: ChatLayoutRoute,
});

function ChatLayoutRoute() {
  const navigate = useNavigate();
  const params = useParams({ from: "/chat/$chatId", shouldThrow: false });
  const activeChatId = params?.chatId ?? null;

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
          void navigate({ to: "/chat" });
        }}
      />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
