import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const AGENT_EDITOR_CHAT_AGENT = "agent-editor";
const CHAT_SESSION_TTL_SECONDS = 259_200;
const CHAT_SESSION_SEQUENCE_NAME = "chat_session";
const CHAT_SESSION_PAGE_SIZE = 30;

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

function toChatSessionResponse(session: {
  id: string;
  seqId: number;
  agent: string;
  title: string | null;
  titleType: string;
  version: number;
  currentMessageId: number | null;
  pinned: boolean;
  isEmpty: boolean;
  insertedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    seq_id: session.seqId,
    agent: session.agent,
    title: session.title,
    title_type: session.titleType,
    version: session.version,
    current_message_id: session.currentMessageId,
    pinned: session.pinned,
    is_empty: session.isEmpty,
    inserted_at: toEpochSeconds(session.insertedAt),
    updated_at: toEpochSeconds(session.updatedAt),
  };
}

export async function createAgentEditorChatSession() {
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
        agent: AGENT_EDITOR_CHAT_AGENT,
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

export async function createAgentEditorChatSessionHandler() {
  try {
    const body = await createAgentEditorChatSession();
    return Response.json(body);
  } catch (error) {
    console.error("POST /api/agent-editor/chat_session/create failed", error);
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
  seqId: number;
  title: string | null;
  titleType: string;
  pinned: boolean;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    seq_id: session.seqId,
    title: session.title,
    title_type: session.titleType,
    pinned: session.pinned,
    updated_at: toEpochSeconds(session.updatedAt),
  };
}

export async function fetchAgentEditorChatSessionsPageHandler(
  request: Request,
) {
  try {
    const url = new URL(request.url);
    const pinnedParam = url.searchParams.get("lte_cursor.pinned");
    const updatedAtParam = url.searchParams.get("lte_cursor.updated_at");
    const seqIdParam = url.searchParams.get("lte_cursor.seq_id");

    const pinned = pinnedParam === "true";
    const updatedAtCursor = updatedAtParam ? Number(updatedAtParam) : null;
    const seqIdCursor = seqIdParam ? Number(seqIdParam) : null;
    const where: Prisma.ChatSessionWhereInput = {
      agent: AGENT_EDITOR_CHAT_AGENT,
      pinned,
      isEmpty: false,
    };

    if (updatedAtCursor !== null && Number.isFinite(updatedAtCursor)) {
      const updatedAt = new Date(updatedAtCursor * 1000);

      if (seqIdCursor !== null && Number.isFinite(seqIdCursor)) {
        where.OR = [
          { updatedAt: { lt: updatedAt } },
          {
            updatedAt,
            seqId: { lt: seqIdCursor },
          },
        ];
      } else {
        where.updatedAt = {
          lt: updatedAt,
        };
      }
    }

    const sessions = await prisma.chatSession.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { seqId: "desc" }],
      take: CHAT_SESSION_PAGE_SIZE + 1,
    });
    const pageSessions = sessions.slice(0, CHAT_SESSION_PAGE_SIZE);
    const lastSession = pageSessions.at(-1);
    const nextCursor =
      sessions.length > CHAT_SESSION_PAGE_SIZE && lastSession
        ? {
            updated_at: toEpochSeconds(lastSession.updatedAt),
            seq_id: lastSession.seqId,
          }
        : null;

    return Response.json({
      code: 0,
      msg: "",
      data: {
        biz_code: 0,
        biz_msg: "",
        biz_data: {
          chat_sessions: pageSessions.map(toChatSessionListItem),
          has_more: sessions.length > CHAT_SESSION_PAGE_SIZE,
          next_cursor: nextCursor,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/agent-editor/chat_session/fetch_page failed", error);
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

export { AGENT_EDITOR_CHAT_AGENT };
