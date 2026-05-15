import { createFileRoute } from "@tanstack/react-router";
import { agentEditorHistoryMessagesHandler } from "@/src/server/agent-editor-chat/history-messages";

export const Route = createFileRoute("/api/agent-editor/chat/history_messages")({
  server: {
    handlers: {
      GET: ({ request }) => agentEditorHistoryMessagesHandler(request),
    },
  },
});
