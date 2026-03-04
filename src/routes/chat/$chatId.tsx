import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/chat/$chatId")({
  component: ChatDetailRoute,
});

function ChatDetailRoute() {
  return null;
}
