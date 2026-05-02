import { createFileRoute } from "@tanstack/react-router";
import { fetchChatSessionsPageHandler } from "@/src/server/session-chat/chat-session";

export const Route = createFileRoute("/api/v0/chat_session/fetch_page")({
  server: {
    handlers: {
      GET: ({ request }) => fetchChatSessionsPageHandler(request),
    },
  },
});
