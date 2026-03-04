import { createFileRoute } from "@tanstack/react-router";
import { createChatRunHandler } from "@/src/server/chat/chat-runs";

export const Route = createFileRoute("/api/chats/$chatId/runs/")({
  server: {
    handlers: {
      POST: ({ request, params }) => createChatRunHandler(request, params.chatId),
    },
  },
});
