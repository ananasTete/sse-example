import { createFileRoute } from "@tanstack/react-router";
import { ChatIndexView } from "@/features/session-chat/components/chat-index-view";

export const Route = createFileRoute("/session-chat/")({
  component: ChatTestIndexPage,
});

function ChatTestIndexPage() {
  return <ChatIndexView />;
}
