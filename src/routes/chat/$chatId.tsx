import { createFileRoute } from "@tanstack/react-router";
import { ChatDetailConversationPage } from "@/features/chat/pages/chat-detail-conversation-page";

export const Route = createFileRoute("/chat/$chatId")({
  component: ChatDetailRoute,
});

function ChatDetailRoute() {
  const { chatId } = Route.useParams();

  return <ChatDetailConversationPage chatId={chatId} />;
}
