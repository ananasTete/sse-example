import { createFileRoute } from "@tanstack/react-router";
import { agentEditorResumeChatCompletionStreamHandler } from "@/src/server/agent-editor-chat/chat-completion";

export const Route = createFileRoute("/api/agent-editor/chat/resume_stream")({
  server: {
    handlers: {
      POST: ({ request }) =>
        agentEditorResumeChatCompletionStreamHandler(request),
    },
  },
});
