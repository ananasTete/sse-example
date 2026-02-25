import { NextRequest } from "next/server";
import { chatStore } from "@/lib/chat-store";

export const runtime = "nodejs";

interface CreateChatBody {
  id?: string;
  title?: string;
}

export async function POST(req: NextRequest) {
  try {
    let body: CreateChatBody = {};

    try {
      body = (await req.json()) as CreateChatBody;
    } catch {
      body = {};
    }

    const chat = await chatStore.createChat({
      id: body.id,
      title: body.title,
    });

    return Response.json({ chat }, { status: 201 });
  } catch (error) {
    console.error("POST /api/chats failed", error);
    return Response.json(
      { error: "Failed to create chat. Please check DATABASE_URL and Prisma migration." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

    const parsedLimit = limitParam ? Number(limitParam) : undefined;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

    const result = await chatStore.listChats({ limit, cursor });

    return Response.json(result);
  } catch (error) {
    console.error("GET /api/chats failed", error);
    return Response.json({ error: "Failed to list chats." }, { status: 500 });
  }
}
