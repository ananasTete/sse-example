import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma";
import { activeStreamParts } from "@/src/server/stream-manager";
import type {
  ChatTree,
  ChatNode,
  MessagePart,
} from "@/src/types/chat-advanced";

export const Route = createFileRoute("/api/advanced-chat/$chatId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const convId = params.chatId;
        const rootId = `chat-root-${convId}`;

        const conversation = await prisma.chat.findUnique({
          where: { id: convId },
          include: { messages: true },
        });

        if (!conversation) return new Response("Not found", { status: 404 });

        const mapping: Record<string, ChatNode> = {};

        mapping[rootId] = {
          id: rootId,
          parentId: null,
          childIds: [],
          role: "root",
          message: null,
        };

        conversation.messages.forEach((msg) => {
          mapping[msg.id] = {
            id: msg.id,
            parentId: msg.parentId || rootId,
            childIds: [],
            role: msg.role as "user" | "assistant",
            message: {
              id: msg.id,
              role: msg.role as "user" | "assistant",
              status: msg.status as "completed" | "in_progress" | "aborted" | "error",
              stopReason: null,
              parts: activeStreamParts.get(msg.id) || (msg.partsJson as MessagePart[]) || [],
              createdAt: msg.createdAt.toISOString(),
            },
          };
        });

        Object.values(mapping).forEach((node) => {
          if (node.parentId && mapping[node.parentId]) {
            mapping[node.parentId].childIds.push(node.id);
          }
        });

        const tree: ChatTree = {
          rootId: rootId,
          currentLeafId: conversation.cursorMessageId || rootId,
          mapping,
        };

        return new Response(JSON.stringify(tree), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
