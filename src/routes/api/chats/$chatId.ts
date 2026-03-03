import { createFileRoute } from "@tanstack/react-router";
import {
  chatStreamHandler,
  deleteChatHandler,
  getChatHandler,
  patchChatHandler,
} from "@/src/server/chat/chats-detail";

export const Route = createFileRoute("/api/chats/$chatId")({
  server: {
    handlers: {
      GET: ({ request, params }) => getChatHandler(request, params.chatId),
      PATCH: ({ request, params }) => patchChatHandler(request, params.chatId),
      DELETE: ({ request, params }) =>
        deleteChatHandler(request, params.chatId),
      POST: ({ request, params }) => chatStreamHandler(request, params.chatId),
    },
  },
});
