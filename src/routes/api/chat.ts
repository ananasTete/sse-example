import { createFileRoute } from "@tanstack/react-router";
import {
  simpleChatGetHandler,
  simpleChatPostHandler,
} from "@/src/server/chat/simple-chat";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: ({ request }) => simpleChatGetHandler(request),
      POST: ({ request }) => simpleChatPostHandler(request),
    },
  },
});
