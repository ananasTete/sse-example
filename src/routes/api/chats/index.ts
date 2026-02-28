import { createFileRoute } from "@tanstack/react-router";
import {
  createChatHandler,
  listChatsHandler,
} from "@/src/server/chat/chats-collection";

export const Route = createFileRoute("/api/chats/")({
  server: {
    handlers: {
      GET: ({ request }) => listChatsHandler(request),
      POST: ({ request }) => createChatHandler(request),
    },
  },
});
