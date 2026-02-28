import { createFileRoute } from "@tanstack/react-router";
import {
  deleteMessageHandler,
  patchMessageHandler,
} from "@/src/server/chat/messages-detail";

export const Route = createFileRoute("/api/chats/$chatId/messages/$messageId")(
  {
    server: {
      handlers: {
        PATCH: ({ request, params }) =>
          patchMessageHandler(request, params.chatId, params.messageId),
        DELETE: ({ params }) =>
          deleteMessageHandler(params.chatId, params.messageId),
      },
    },
  },
);
