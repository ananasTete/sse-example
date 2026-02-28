import { chatStore } from "@/lib/chat-store";
import { jsonError, parseJsonSafe } from "@/src/server/http/json";

interface CreateChatBody {
  id?: string;
  title?: string;
}

export async function createChatHandler(request: Request) {
  try {
    const body = await parseJsonSafe<CreateChatBody>(request, {});

    const chat = await chatStore.createChat({
      id: body.id,
      title: body.title,
    });

    return Response.json({ chat }, { status: 201 });
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
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const parsedLimit = limitParam ? Number(limitParam) : undefined;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

    const result = await chatStore.listChats({ limit, cursor });

    return Response.json(result);
  } catch (error) {
    console.error("GET /api/chats failed", error);
    return jsonError("Failed to list chats.", 500);
  }
}
