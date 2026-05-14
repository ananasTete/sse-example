import { createFileRoute } from "@tanstack/react-router";
import { ChatDetailView } from "@/features/session-chat/components/chat-detail-view";

export const Route = createFileRoute("/session-chat/$chat_session_id")({
  component: ChatSessionPage,
});

function ChatSessionPage() {
  const { chat_session_id: chatSessionId } = Route.useParams();

  return <ChatDetailView chatSessionId={chatSessionId} />;
}
