import { createFileRoute } from "@tanstack/react-router";
import { ChatConversationPage } from "@/features/chat/pages/chat-conversation-page";

export const Route = createFileRoute("/chat/$chatId")({
  component: ChatDetailRoute,
});

function ChatDetailRoute() {
  const { chatId } = Route.useParams();

  return <ChatConversationPage chatId={chatId} />;
}
