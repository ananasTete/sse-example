import { createFileRoute } from "@tanstack/react-router";
import { chatCompletionHandler } from "@/src/server/deepseek/chat-completion";

export const Route = createFileRoute("/chat/completion")({
  server: {
    handlers: {
      POST: ({ request }) => chatCompletionHandler(request),
    },
  },
});
