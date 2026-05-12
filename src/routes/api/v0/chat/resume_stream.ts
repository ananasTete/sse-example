import { createFileRoute } from "@tanstack/react-router";
import { resumeChatCompletionStreamHandler } from "@/src/server/session-chat/chat-completion";

export const Route = createFileRoute("/api/v0/chat/resume_stream")({
  server: {
    handlers: {
      POST: ({ request }) => resumeChatCompletionStreamHandler(request),
    },
  },
});
