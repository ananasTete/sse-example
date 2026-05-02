import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { chatCompletionHandler as ChatCompletionHandler } from "@/src/server/session-chat/chat-completion";
import type { createChatSession as CreateChatSession } from "@/src/server/session-chat/chat-session";
import type { fetchChatSessionsPageHandler as FetchChatSessionsPageHandler } from "@/src/server/session-chat/chat-session";

const testDir = mkdtempSync(path.join(tmpdir(), "session-chat-"));
const databaseUrl = `file:${path.join(testDir, "test.db")}`;

process.env.DATABASE_URL = databaseUrl;
process.env.DEEPSEEK_API_KEY = "test-api-key";

let prisma: PrismaClient;
let createChatSession: typeof CreateChatSession;
let chatCompletionHandler: typeof ChatCompletionHandler;
let fetchChatSessionsPageHandler: typeof FetchChatSessionsPageHandler;

type StreamTextOverride = NonNullable<
  Parameters<typeof chatCompletionHandler>[1]
>["streamText"];

function createCompletionRequest(input: {
  chatSessionId: string;
  prompt?: string;
  parentMessageId?: number | null;
  preempt?: boolean;
}) {
  return new Request("http://localhost/chat/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      parent_message_id: input.parentMessageId ?? null,
      model_type: "default",
      prompt: input.prompt ?? "hello",
      ref_file_ids: [],
      thinking_enabled: false,
      search_enabled: false,
      preempt: input.preempt ?? false,
    }),
  });
}

function createStreamTextOverride(
  fullStream: AsyncIterable<unknown>,
): StreamTextOverride {
  return (() => ({ fullStream })) as unknown as StreamTextOverride;
}

async function createSessionId() {
  const body = await createChatSession();
  return body.data.biz_data.chat_session.id;
}

async function readJson(response: Response) {
  return (await response.json()) as {
    data?: {
      biz_data?: {
        chat_sessions?: Array<{ id: string; seq_id: number; updated_at: number }>;
        has_more?: boolean;
        next_cursor?: { updated_at: number; seq_id: number } | null;
      } | null;
    };
  };
}

async function createTestSchema() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "seqId" INTEGER NOT NULL,
      "agent" TEXT NOT NULL DEFAULT 'chat',
      "modelType" TEXT NOT NULL DEFAULT 'default',
      "title" TEXT,
      "titleType" TEXT NOT NULL DEFAULT 'WIP',
      "version" INTEGER NOT NULL DEFAULT 0,
      "currentMessageId" INTEGER,
      "nextMessageId" INTEGER NOT NULL DEFAULT 0,
      "nextFragmentId" INTEGER NOT NULL DEFAULT 0,
      "pinned" BOOLEAN NOT NULL DEFAULT false,
      "isEmpty" BOOLEAN NOT NULL DEFAULT true,
      "expiresAt" DATETIME,
      "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatSequence" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "value" INTEGER NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatMessage" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "localId" INTEGER NOT NULL,
      "chatSessionId" TEXT NOT NULL,
      "parentId" INTEGER,
      "model" TEXT NOT NULL DEFAULT '',
      "role" TEXT NOT NULL,
      "thinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
      "banEdit" BOOLEAN NOT NULL DEFAULT false,
      "banRegenerate" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL,
      "incompleteMessage" TEXT,
      "accumulatedTokenUsage" INTEGER NOT NULL DEFAULT 0,
      "feedback" JSONB,
      "searchEnabled" BOOLEAN NOT NULL DEFAULT false,
      "conversationMode" TEXT NOT NULL DEFAULT 'DEFAULT',
      "hasPendingFragment" BOOLEAN NOT NULL DEFAULT false,
      "autoContinue" BOOLEAN NOT NULL DEFAULT false,
      "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatMessage_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MessageFragment" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "localId" INTEGER NOT NULL,
      "messageId" INTEGER NOT NULL,
      "type" TEXT NOT NULL,
      "status" TEXT,
      "content" TEXT,
      "queriesJson" JSONB,
      "resultsJson" JSONB,
      "referencesJson" JSONB,
      "stageId" INTEGER,
      "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MessageFragment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChatSession_seqId_key" ON "ChatSession"("seqId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ChatSession_pinned_updatedAt_idx" ON "ChatSession"("pinned", "updatedAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ChatSession_expiresAt_idx" ON "ChatSession"("expiresAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ChatMessage_chatSessionId_insertedAt_idx" ON "ChatMessage"("chatSessionId", "insertedAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ChatMessage_chatSessionId_parentId_idx" ON "ChatMessage"("chatSessionId", "parentId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_chatSessionId_localId_key" ON "ChatMessage"("chatSessionId", "localId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "MessageFragment_messageId_id_idx" ON "MessageFragment"("messageId", "id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "MessageFragment_messageId_localId_key" ON "MessageFragment"("messageId", "localId")`,
  );
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ createChatSession, fetchChatSessionsPageHandler } = await import(
    "@/src/server/session-chat/chat-session"
  ));
  ({ chatCompletionHandler } = await import(
    "@/src/server/session-chat/chat-completion"
  ));

  await createTestSchema();
});

beforeEach(async () => {
  await prisma.messageFragment.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.chatSequence.deleteMany();
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

test("completion failure before first token still creates a failed assistant message", async () => {
  const chatSessionId = await createSessionId();
  const originalConsoleError = console.error;

  const failingStream: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          throw new Error("provider unavailable");
        },
      };
    },
  };

  console.error = () => {};

  try {
    const response = await chatCompletionHandler(
      createCompletionRequest({ chatSessionId }),
      {
        streamText: createStreamTextOverride(failingStream),
      },
    );

    assert.equal(response.status, 200);

    const sseText = await response.text();
    assert.match(sseText, /event: ready/);
    assert.match(sseText, /"response"/);
    assert.match(sseText, /"FAILED"/);
    assert.match(sseText, /"Completion failed"/);
  } finally {
    console.error = originalConsoleError;
  }

  const assistant = await prisma.chatMessage.findFirstOrThrow({
    where: {
      chatSessionId,
      role: "ASSISTANT",
    },
    include: {
      fragments: true,
    },
  });

  assert.equal(assistant.status, "FAILED");
  assert.equal(assistant.hasPendingFragment, false);
  assert.equal(assistant.incompleteMessage, "Completion failed");
  assert.equal(assistant.fragments.length, 1);
  assert.equal(assistant.fragments[0].type, "RESPONSE");
  assert.equal(assistant.fragments[0].content, "");
});

test("second completion on an active session returns 409", async () => {
  const chatSessionId = await createSessionId();
  let releaseStream!: () => void;
  const streamReleased = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });

  async function* slowStream() {
    yield { type: "text-delta", text: "hello" };
    await streamReleased;
    yield { type: "finish", totalUsage: { totalTokens: 1 } };
  }

  const firstResponse = await chatCompletionHandler(
    createCompletionRequest({ chatSessionId }),
    {
      streamText: createStreamTextOverride(slowStream()),
    },
  );

  const secondResponse = await chatCompletionHandler(
    createCompletionRequest({ chatSessionId }),
    {
      streamText: createStreamTextOverride(slowStream()),
    },
  );

  assert.equal(secondResponse.status, 409);
  assert.match(await secondResponse.text(), /A completion is already in progress/);

  releaseStream();
  assert.match(await firstResponse.text(), /"FINISHED"/);
});

test("session pagination uses updated_at and seq_id as a compound cursor", async () => {
  const updatedAt = new Date("2026-05-02T00:00:00.000Z");

  await prisma.chatSession.createMany({
    data: Array.from({ length: 35 }, (_, index) => {
      const seqId = index + 1;

      return {
        id: `session-${seqId}`,
        seqId,
        title: `Session ${seqId}`,
        titleType: "SYSTEM",
        isEmpty: false,
        insertedAt: updatedAt,
        updatedAt,
      };
    }),
  });

  const firstResponse = await fetchChatSessionsPageHandler(
    new Request("http://localhost/api/v0/chat_session/fetch_page"),
  );
  const firstBody = await readJson(firstResponse);
  const firstPage = firstBody.data?.biz_data?.chat_sessions ?? [];
  const nextCursor = firstBody.data?.biz_data?.next_cursor;

  assert.equal(firstPage.length, 30);
  assert.equal(firstPage[0].seq_id, 35);
  assert.equal(firstPage.at(-1)?.seq_id, 6);
  assert.deepEqual(nextCursor, {
    updated_at: updatedAt.getTime() / 1000,
    seq_id: 6,
  });

  const secondResponse = await fetchChatSessionsPageHandler(
    new Request(
      `http://localhost/api/v0/chat_session/fetch_page?lte_cursor.updated_at=${nextCursor?.updated_at}&lte_cursor.seq_id=${nextCursor?.seq_id}`,
    ),
  );
  const secondBody = await readJson(secondResponse);
  const secondPage = secondBody.data?.biz_data?.chat_sessions ?? [];

  assert.equal(secondPage.length, 5);
  assert.deepEqual(
    secondPage.map((session) => session.seq_id),
    [5, 4, 3, 2, 1],
  );
  assert.equal(secondBody.data?.biz_data?.has_more, false);
  assert.equal(secondBody.data?.biz_data?.next_cursor, null);
});
