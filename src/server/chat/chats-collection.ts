import { chatStore } from "@/lib/chat-store";
import { MessagePart } from "@/features/ai-sdk/hooks/use-chat/types";
import { jsonError, parseJsonSafe } from "@/src/server/http/json";
import { parseCreateChatRequest } from "./contracts";
import {
  resolveRequestUserId,
  toFlatChatResponse,
  toFlatHistoryResponse,
} from "./chat-service";

export async function createChatHandler(request: Request) {
  try {
    const payload = await parseJsonSafe<unknown>(request, {});
    let body: ReturnType<typeof parseCreateChatRequest>;
    try {
      body = parseCreateChatRequest(payload);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Invalid request body",
        400,
      );
    }

    const userId = resolveRequestUserId(request);
    const messageId = body.message.id ?? crypto.randomUUID();
    const createdAt = body.message.createdAt ?? new Date().toISOString();

    const chat = await chatStore.createChatWithFirstMessage({
      chatId: body.id,
      userId,
      message: {
        id: messageId,
        chatId: body.id,
        role: "user",
        parts: body.message.parts as MessagePart[],
        createdAt,
      },
    });

    return Response.json(toFlatChatResponse(chat), { status: 201 });
  } catch (error) {
    console.error("POST /api/chats failed", error);
    return jsonError(
      "Failed to create chat. Please check DATABASE_URL and Prisma migration.",
      500,
    );
  }
}

export async function listChatsHandler(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = resolveRequestUserId(request);
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const parsedLimit = limitParam ? Number(limitParam) : undefined;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

    const result = await chatStore.listChats({ limit, cursor, userId });

    return Response.json(toFlatHistoryResponse(result));
  } catch (error) {
    console.error("GET /api/chats failed", error);
    return jsonError("Failed to list chats.", 500);
  }
}
