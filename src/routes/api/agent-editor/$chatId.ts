import { createFileRoute } from "@tanstack/react-router";
import { agentEditorStreamHandler } from "@/src/server/chat/agent-editor";

export const Route = createFileRoute("/api/agent-editor/$chatId")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        agentEditorStreamHandler(request, params.chatId),
    },
  },
});
