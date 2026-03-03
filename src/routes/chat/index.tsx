import { createFileRoute } from "@tanstack/react-router";
import { ChatConversationPage } from "@/features/chat/pages/chat-conversation-page";

export const Route = createFileRoute("/chat/")({
  component: ChatIndexRoute,
});

function ChatIndexRoute() {
  return <ChatConversationPage />;
}
