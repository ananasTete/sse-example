import { createFileRoute } from "@tanstack/react-router";
import { ChatNewConversationPage } from "@/features/chat/pages/chat-new-conversation-page";

export const Route = createFileRoute("/chat/")({
  component: ChatIndexRoute,
});

function ChatIndexRoute() {
  return <ChatNewConversationPage />;
}
