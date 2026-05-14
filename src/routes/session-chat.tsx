import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ChatLayout } from "@/features/session-chat/components/chat-layout";

export const Route = createFileRoute("/session-chat")({
  component: ChatTestLayout,
});

function ChatTestLayout() {
  return (
    <ChatLayout>
      <Outlet />
    </ChatLayout>
  );
}
