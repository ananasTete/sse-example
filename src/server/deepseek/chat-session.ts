import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const CHAT_SESSION_TTL_SECONDS = 259_200;
const CHAT_SESSION_SEQUENCE_NAME = "chat_session";

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
