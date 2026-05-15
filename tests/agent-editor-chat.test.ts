import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { agentEditorChatCompletionHandler as AgentEditorChatCompletionHandler } from "@/src/server/agent-editor-chat/chat-completion";
import type { agentEditorResumeChatCompletionStreamHandler as AgentEditorResumeChatCompletionStreamHandler } from "@/src/server/agent-editor-chat/chat-completion";
import type { createAgentEditorChatSession as CreateAgentEditorChatSession } from "@/src/server/agent-editor-chat/chat-session";
import type { fetchAgentEditorChatSessionsPageHandler as FetchAgentEditorChatSessionsPageHandler } from "@/src/server/agent-editor-chat/chat-session";
import type { agentEditorHistoryMessagesHandler as AgentEditorHistoryMessagesHandler } from "@/src/server/agent-editor-chat/history-messages";

const testDir = mkdtempSync(path.join(tmpdir(), "agent-editor-chat-"));
const databaseUrl = `file:${path.join(testDir, "test.db")}`;

process.env.DATABASE_URL = databaseUrl;
process.env.DEEPSEEK_API_KEY = "test-api-key";

let prisma: PrismaClient;
let createAgentEditorChatSession: typeof CreateAgentEditorChatSession;
let fetchAgentEditorChatSessionsPageHandler: typeof FetchAgentEditorChatSessionsPageHandler;
let agentEditorHistoryMessagesHandler: typeof AgentEditorHistoryMessagesHandler;
let agentEditorChatCompletionHandler: typeof AgentEditorChatCompletionHandler;
let agentEditorResumeChatCompletionStreamHandler: typeof AgentEditorResumeChatCompletionStreamHandler;

type StreamTextOverride = NonNullable<
  Parameters<typeof agentEditorChatCompletionHandler>[1]
>["streamText"];

function createCompletionRequest(input: {
  chatSessionId: string;
  prompt?: string;
  parentMessageId?: number | null;
}) {
  return new Request("http://localhost/api/agent-editor/chat/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      parent_message_id: input.parentMessageId ?? null,
      prompt: input.prompt ?? "hello",
      ref_file_ids: [],
      thinking_enabled: false,
      search_enabled: false,
      preempt: false,
    }),
  });
}

function createResumeStreamRequest(input: {
  chatSessionId: string;
  messageId: number;
}) {
  return new Request("http://localhost/api/agent-editor/chat/resume_stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      message_id: input.messageId,
    }),
  });
}

function createStreamTextOverride(
  fullStream: AsyncIterable<unknown>,
): StreamTextOverride {
  return (() => ({ fullStream })) as unknown as StreamTextOverride;
}

async function createAgentEditorSessionId() {
  const body = await createAgentEditorChatSession();
  return body.data.biz_data.chat_session.id;
}

async function createChatSessionId() {
  await prisma.chatSequence.upsert({
    where: { name: "chat_session" },
    update: { value: { increment: 1 } },
    create: { name: "chat_session", value: 1 },
  });
  const sequence = await prisma.chatSequence.findUniqueOrThrow({
    where: { name: "chat_session" },
  });
  const session = await prisma.chatSession.create({
    data: {
      id: "chat-session",
      seqId: sequence.value + 100,
      agent: "chat",
      isEmpty: false,
    },
  });
  return session.id;
}

async function createTestSchema() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "seqId" INTEGER NOT NULL,
      "agent" TEXT NOT NULL DEFAULT 'chat',
      "title" TEXT,
      "titleType" TEXT NOT NULL DEFAULT 'WIP',
      "version" INTEGER NOT NULL DEFAULT 0,
      "currentMessageId" INTEGER,
      "nextMessageId" INTEGER NOT NULL DEFAULT 0,
      "nextBlockId" INTEGER NOT NULL DEFAULT 0,
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
      "hasPendingBlock" BOOLEAN NOT NULL DEFAULT false,
      "autoContinue" BOOLEAN NOT NULL DEFAULT false,
      "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatMessage_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MessageBlock" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "localId" INTEGER NOT NULL,
      "messageId" INTEGER NOT NULL,
      "type" TEXT NOT NULL,
      "status" TEXT,
      "content" TEXT,
      "toolName" TEXT,
      "toolCallId" TEXT,
      "toolInputJson" JSONB,
      "toolOutputJson" JSONB,
      "queriesJson" JSONB,
      "resultsJson" JSONB,
      "referencesJson" JSONB,
      "stageId" INTEGER,
      "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MessageBlock_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChatSession_seqId_key" ON "ChatSession"("seqId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_chatSessionId_localId_key" ON "ChatMessage"("chatSessionId", "localId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "MessageBlock_messageId_localId_key" ON "MessageBlock"("messageId", "localId")`,
  );
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ createAgentEditorChatSession, fetchAgentEditorChatSessionsPageHandler } =
    await import("@/src/server/agent-editor-chat/chat-session"));
  ({ agentEditorHistoryMessagesHandler } = await import(
    "@/src/server/agent-editor-chat/history-messages"
  ));
  ({
    agentEditorChatCompletionHandler,
    agentEditorResumeChatCompletionStreamHandler,
  } = await import("@/src/server/agent-editor-chat/chat-completion"));

  await createTestSchema();
});

beforeEach(async () => {
  await prisma.messageBlock.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.chatSequence.deleteMany();
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

test("agent editor session creation stores the agent marker", async () => {
  const body = await createAgentEditorChatSession();
  const session = await prisma.chatSession.findUniqueOrThrow({
    where: { id: body.data.biz_data.chat_session.id },
  });

  assert.equal(session.agent, "agent-editor");
  assert.equal(body.data.biz_data.chat_session.agent, "agent-editor");
});

test("agent editor session list only returns agent editor sessions", async () => {
  const agentSessionId = await createAgentEditorSessionId();
  await prisma.chatSession.update({
    where: { id: agentSessionId },
    data: { isEmpty: false },
  });
  await createChatSessionId();

  const response = await fetchAgentEditorChatSessionsPageHandler(
    new Request("http://localhost/api/agent-editor/chat_session/fetch_page"),
  );
  const body = (await response.json()) as {
    data: { biz_data: { chat_sessions: Array<{ id: string }> } };
  };

  assert.deepEqual(
    body.data.biz_data.chat_sessions.map((session) => session.id),
    [agentSessionId],
  );
});

test("completion persists messages and history reads them back", async () => {
  const chatSessionId = await createAgentEditorSessionId();

  async function* stream() {
    yield { type: "text-delta", text: "hello agent" };
    yield { type: "finish", totalUsage: { totalTokens: 2 } };
  }

  const response = await agentEditorChatCompletionHandler(
    createCompletionRequest({ chatSessionId, prompt: "hello" }),
    {
      streamText: createStreamTextOverride(stream()),
    },
  );

  assert.equal(response.status, 200);
  const sseText = await response.text();
  assert.match(sseText, /event: ready/);
  assert.match(sseText, /hello agent/);

  const historyResponse = await agentEditorHistoryMessagesHandler(
    new Request(
      `http://localhost/api/agent-editor/chat/history_messages?chat_session_id=${chatSessionId}`,
    ),
  );
  const historyBody = (await historyResponse.json()) as {
    data: { biz_data: { chat_messages: Array<{ role: string }> } };
  };

  assert.deepEqual(
    historyBody.data.biz_data.chat_messages.map((message) => message.role),
    ["USER", "ASSISTANT"],
  );
});

test("resume reconnects a pending assistant message through the agent endpoint", async () => {
  const chatSessionId = await createAgentEditorSessionId();
  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { nextMessageId: 2, currentMessageId: 2, isEmpty: false },
  });
  await prisma.chatMessage.create({
    data: {
      localId: 1,
      chatSessionId,
      role: "USER",
      status: "FINISHED",
      blocks: {
        create: {
          localId: 1,
          type: "text",
          content: "hello",
        },
      },
    },
  });
  await prisma.chatMessage.create({
    data: {
      localId: 2,
      parentId: 1,
      chatSessionId,
      role: "ASSISTANT",
      status: "WIP",
      hasPendingBlock: true,
      blocks: {
        create: {
          localId: 1,
          type: "text",
          content: "partial",
        },
      },
    },
  });

  const response = await agentEditorResumeChatCompletionStreamHandler(
    createResumeStreamRequest({ chatSessionId, messageId: 2 }),
  );
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(text, /event: ready/);
  assert.match(text, /partial/);
  assert.match(text, /生成已中断/);
});

test("completion rejects chat sessions owned by another agent", async () => {
  const chatSessionId = await createChatSessionId();

  async function* stream() {
    yield { type: "text-delta", text: "blocked" };
  }

  const response = await agentEditorChatCompletionHandler(
    createCompletionRequest({ chatSessionId }),
    {
      streamText: createStreamTextOverride(stream()),
    },
  );

  assert.equal(response.status, 404);
  assert.equal(
    await prisma.chatMessage.count({ where: { chatSessionId } }),
    0,
  );
});
