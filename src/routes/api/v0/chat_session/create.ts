import { createFileRoute } from "@tanstack/react-router";
import { createChatSessionHandler } from "@/src/server/session-chat/chat-session";

export const Route = createFileRoute("/api/v0/chat_session/create")({
  server: {
    handlers: {
      POST: () => createChatSessionHandler(),
    },
  },
});
