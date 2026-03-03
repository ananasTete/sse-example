import { chatStore } from "@/lib/chat-store";
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

    const chat = await chatStore.createChat({
      id: body.id,
      title: body.title,
      userId,
      cursorMessageId: null,
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
