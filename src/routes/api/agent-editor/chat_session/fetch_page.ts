import { createFileRoute } from "@tanstack/react-router";
import { fetchAgentEditorChatSessionsPageHandler } from "@/src/server/agent-editor-chat/chat-session";

export const Route = createFileRoute("/api/agent-editor/chat_session/fetch_page")({
  server: {
    handlers: {
      GET: ({ request }) => fetchAgentEditorChatSessionsPageHandler(request),
    },
  },
});
