import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CHAT_SESSION_TTL_SECONDS = 259_200;
const CHAT_SESSION_SEQUENCE_NAME = "chat_session";
const DEFAULT_FETCH_PAGE_LIMIT = 30;

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

function toChatSessionResponse(session: {
  id: string;
  seqId: number;
  agent: string;
  modelType: string;
  title: string | null;
  titleType: string;
  version: number;
  currentMessageId: number | null;
  pinned: boolean;
  insertedAt: Date;
  updatedAt: Date;
}): {
  id: string;
  seq_id: number;
  agent: string;
  model_type: string;
  title: string | null;
  title_type: string;
  version: number;
  current_message_id: number | null;
  pinned: boolean;
  inserted_at: number;
  updated_at: number;
} {
  return {
    id: session.id,
    seq_id: session.seqId,
    agent: session.agent,
    model_type: session.modelType,
    title: session.title,
    title_type: session.titleType,
    version: session.version,
    current_message_id: session.currentMessageId,
    pinned: session.pinned,
    inserted_at: toEpochSeconds(session.insertedAt),
    updated_at: toEpochSeconds(session.updatedAt),
  };
}

export async function createChatSession() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHAT_SESSION_TTL_SECONDS * 1000);

  const session = await prisma.$transaction(async (tx) => {
    const sequence = await tx.chatSequence.upsert({
      where: { name: CHAT_SESSION_SEQUENCE_NAME },
      update: { value: { increment: 1 } },
      create: { name: CHAT_SESSION_SEQUENCE_NAME, value: 1 },
    });

    return tx.chatSession.create({
      data: {
        id: randomUUID(),
        seqId: sequence.value,
        expiresAt,
      },
    });
  });

  return {
    code: 0,
    msg: "",
    data: {
      biz_code: 0,
      biz_msg: "",
      biz_data: {
        chat_session: toChatSessionResponse(session),
        ttl_seconds: CHAT_SESSION_TTL_SECONDS,
      },
    },
  };
}

export async function createChatSessionHandler() {
  try {
    const body = await createChatSession();
    return Response.json(body);
  } catch (error) {
    console.error("POST /api/v0/chat_session/create failed", error);
    return Response.json(
      {
        code: 500,
        msg: "Failed to create chat session",
        data: {
          biz_code: 500,
          biz_msg: "Failed to create chat session",
          biz_data: null,
        },
      },
      { status: 500 },
    );
  }
}

function toChatSessionListItem(session: {
  id: string;
  title: string | null;
  titleType: string;
  pinned: boolean;
  modelType: string;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    title: session.title,
    title_type: session.titleType,
    pinned: session.pinned,
    model_type: session.modelType,
    updated_at: toEpochSeconds(session.updatedAt),
  };
}

export async function fetchChatSessionsPageHandler(request: Request) {
  try {
    const url = new URL(request.url);
    const pinnedParam = url.searchParams.get("lte_cursor.pinned");
    const updatedAtParam = url.searchParams.get("lte_cursor.updated_at");
    const limitParam = Number(url.searchParams.get("limit"));

    const pinned = pinnedParam === "true";
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : DEFAULT_FETCH_PAGE_LIMIT;
    const updatedAtCursor = updatedAtParam ? Number(updatedAtParam) : null;
    const where: Prisma.ChatSessionWhereInput = {
      pinned,
      isEmpty: false,
    };

    if (updatedAtCursor !== null && Number.isFinite(updatedAtCursor)) {
      where.updatedAt = {
        lte: new Date(updatedAtCursor * 1000),
      };
    }

    const sessions = await prisma.chatSession.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { seqId: "desc" }],
      take: limit,
    });

    return Response.json({
      code: 0,
      msg: "",
      data: {
        biz_code: 0,
        biz_msg: "",
        biz_data: {
          chat_sessions: sessions.map(toChatSessionListItem),
        },
      },
    });
  } catch (error) {
    console.error("GET /api/v0/chat_session/fetch_page failed", error);
    return Response.json(
      {
        code: 500,
        msg: "Failed to fetch chat sessions",
        data: {
          biz_code: 500,
          biz_msg: "Failed to fetch chat sessions",
          biz_data: null,
        },
      },
      { status: 500 },
    );
  }
}
