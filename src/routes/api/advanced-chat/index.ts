import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/src/server/http/json";
import { nanoid } from "nanoid";

const USER_ID = "local-user";
const DEFAULT_CHAT_TITLE = "新对话";

const CHAT_SUMMARY_SELECT = {
  id: true,
  title: true,
  updatedAt: true,
  createdAt: true,
} as const;

function logRouteError(action: string, error: unknown) {
  console.error(`[api/advanced-chat] Failed to ${action}`, error);
}

export const Route = createFileRoute("/api/advanced-chat/")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const chats = await prisma.chat.findMany({
            where: { userId: USER_ID, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: CHAT_SUMMARY_SELECT,
          });
          return Response.json(chats);
        } catch (error) {
          logRouteError("fetch chat list", error);
          return jsonError("Failed to fetch chat list", 500);
        }
      },
      POST: async () => {
        try {
          const conversation = await prisma.chat.create({
            data: {
              id: nanoid(),
              userId: USER_ID,
              title: DEFAULT_CHAT_TITLE,
              settingsJson: { enabled_web_search: true },
              cursorMessageId: null,
            },
          });
          return Response.json({ id: conversation.id });
        } catch (error) {
          logRouteError("create chat", error);
          return jsonError("Failed to create chat", 500);
        }
      },
    },
  },
});
