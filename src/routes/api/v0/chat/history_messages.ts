import { createFileRoute } from "@tanstack/react-router";
import { historyMessagesHandler } from "@/src/server/session-chat/history-messages";

export const Route = createFileRoute("/api/v0/chat/history_messages")({
  server: {
    handlers: {
      GET: ({ request }) => historyMessagesHandler(request),
    },
  },
});
