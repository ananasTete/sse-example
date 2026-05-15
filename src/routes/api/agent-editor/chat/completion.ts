import { createFileRoute } from "@tanstack/react-router";
import { agentEditorChatCompletionHandler } from "@/src/server/agent-editor-chat/chat-completion";

export const Route = createFileRoute("/api/agent-editor/chat/completion")({
  server: {
    handlers: {
      POST: ({ request }) => agentEditorChatCompletionHandler(request),
    },
  },
});
