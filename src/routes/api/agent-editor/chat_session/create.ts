import { createFileRoute } from "@tanstack/react-router";
import { createAgentEditorChatSessionHandler } from "@/src/server/agent-editor-chat/chat-session";

export const Route = createFileRoute("/api/agent-editor/chat_session/create")({
  server: {
    handlers: {
      POST: () => createAgentEditorChatSessionHandler(),
    },
  },
});
