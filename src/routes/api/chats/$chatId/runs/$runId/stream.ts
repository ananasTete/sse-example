import { createFileRoute } from "@tanstack/react-router";
import { streamChatRunHandler } from "@/src/server/chat/chat-runs";

export const Route = createFileRoute("/api/chats/$chatId/runs/$runId/stream")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        streamChatRunHandler(request, params.chatId, params.runId),
    },
  },
});
