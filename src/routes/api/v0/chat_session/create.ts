import { createFileRoute } from "@tanstack/react-router";
import { createChatSessionHandler } from "@/src/server/deepseek/chat-session";

export const Route = createFileRoute("/api/v0/chat_session/create")({
  server: {
    handlers: {
      POST: () => createChatSessionHandler(),
    },
  },
});
