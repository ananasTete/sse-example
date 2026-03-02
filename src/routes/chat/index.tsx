import { createFileRoute } from "@tanstack/react-router";
import { ChatEntryPage } from "@/features/chat/pages/chat-entry-page";

export const Route = createFileRoute("/chat/")({
  component: ChatIndexRoute,
});

function ChatIndexRoute() {
  return <ChatEntryPage />;
}
