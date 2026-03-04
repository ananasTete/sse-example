import { createFileRoute } from "@tanstack/react-router";
import { cancelChatRunHandler } from "@/src/server/chat/chat-runs";

export const Route = createFileRoute("/api/chats/$chatId/runs/$runId/cancel")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        cancelChatRunHandler(request, params.chatId, params.runId),
    },
  },
});
