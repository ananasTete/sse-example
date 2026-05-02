import { createFileRoute } from "@tanstack/react-router";
import { ChatIndexView } from "@/features/session-chat/components/chat-index-view";

export const Route = createFileRoute("/deepseek-test/")({
  component: ChatTestIndexPage,
});

function ChatTestIndexPage() {
  return <ChatIndexView />;
}
