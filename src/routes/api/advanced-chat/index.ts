import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

export const Route = createFileRoute("/api/advanced-chat/")({
  server: {
    handlers: {
      POST: async () => {
        const userId = "local-user";

        const conversation = await prisma.chat.create({
          data: {
            id: nanoid(),
            userId,
            title: "新对话",
            settingsJson: { enabled_web_search: true },
            cursorMessageId: null,
          },
        });

        return new Response(JSON.stringify({ id: conversation.id }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
