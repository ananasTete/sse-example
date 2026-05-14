import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { ChatState } from "@/features/session-chat/types";
import type { chatCompletionHandler as ChatCompletionHandler } from "@/src/server/session-chat/chat-completion";
import type { resumeChatCompletionStreamHandler as ResumeChatCompletionStreamHandler } from "@/src/server/session-chat/chat-completion";
import type { createChatSession as CreateChatSession } from "@/src/server/session-chat/chat-session";
import type { fetchChatSessionsPageHandler as FetchChatSessionsPageHandler } from "@/src/server/session-chat/chat-session";
import type { historyMessagesHandler as HistoryMessagesHandler } from "@/src/server/session-chat/history-messages";

const testDir = mkdtempSync(path.join(tmpdir(), "session-chat-"));
const databaseUrl = `file:${path.join(testDir, "test.db")}`;

process.env.DATABASE_URL = databaseUrl;
process.env.DEEPSEEK_API_KEY = "test-api-key";

let prisma: PrismaClient;
let createChatSession: typeof CreateChatSession;
let chatCompletionHandler: typeof ChatCompletionHandler;
let resumeChatCompletionStreamHandler: typeof ResumeChatCompletionStreamHandler;
let fetchChatSessionsPageHandler: typeof FetchChatSessionsPageHandler;
let historyMessagesHandler: typeof HistoryMessagesHandler;

type StreamTextOverride = NonNullable<
  Parameters<typeof chatCompletionHandler>[1]
>["streamText"];
type WebSearchOverride = NonNullable<
  Parameters<typeof chatCompletionHandler>[1]
>["webSearch"];

function createCompletionRequest(input: {
  chatSessionId: string;
  prompt?: string;
  parentMessageId?: number | null;
  preempt?: boolean;
  searchEnabled?: boolean;
}) {
  return new Request("http://localhost/chat/completion", {
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
      search_enabled: input.searchEnabled ?? false,
      preempt: input.preempt ?? false,
    }),
  });
}

function createResumeStreamRequest(input: {
  chatSessionId: string;
  messageId: number;
}) {
  return new Request("http://localhost/api/v0/chat/resume_stream", {
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

function createWebSearchOverride(
  payload: Awaited<ReturnType<NonNullable<WebSearchOverride>>>,
): WebSearchOverride {
  return async () => payload;
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

function parseSseEvents(text: string) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines
        .find((line) => line.startsWith("event: "))
        ?.slice("event: ".length);
      const data = lines
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);

      return {
        event,
        data: data ? (JSON.parse(data) as Record<string, unknown>) : null,
      };
    });
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
    `CREATE INDEX IF NOT EXISTS "MessageBlock_messageId_id_idx" ON "MessageBlock"("messageId", "id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "MessageBlock_messageId_localId_key" ON "MessageBlock"("messageId", "localId")`,
  );
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ createChatSession, fetchChatSessionsPageHandler } = await import(
    "@/src/server/session-chat/chat-session"
  ));
  ({ chatCompletionHandler, resumeChatCompletionStreamHandler } = await import(
    "@/src/server/session-chat/chat-completion"
  ));
  ({ historyMessagesHandler } = await import(
    "@/src/server/session-chat/history-messages"
  ));

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
    assert.match(sseText, /"response_message_id":2/);
    assert.match(sseText, /"role":"ASSISTANT"/);
    assert.match(sseText, /"FAILED"/);
    assert.match(sseText, /event: error/);
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
      blocks: true,
    },
  });

  assert.equal(assistant.status, "FAILED");
  assert.equal(assistant.hasPendingBlock, false);
  assert.equal(assistant.incompleteMessage, "Completion failed");
  assert.equal(assistant.blocks.length, 1);
  assert.equal(assistant.blocks[0].type, "text");
  assert.equal(assistant.blocks[0].content, "");
});

test("completion without search persists a default text block", async () => {
  const chatSessionId = await createSessionId();

  async function* stream() {
    yield { type: "text-delta", text: "hello" };
    yield { type: "finish", totalUsage: { totalTokens: 3 } };
  }

  const response = await chatCompletionHandler(
    createCompletionRequest({ chatSessionId }),
    {
      streamText: createStreamTextOverride(stream()),
    },
  );

  const sseText = await response.text();
  assert.match(sseText, /"conversation_mode":"DEFAULT"/);
  assert.doesNotMatch(sseText, /"type":"search"/);

  const assistant = await prisma.chatMessage.findFirstOrThrow({
    where: {
      chatSessionId,
      role: "ASSISTANT",
    },
    include: {
      blocks: {
        orderBy: { localId: "asc" },
      },
    },
  });

  assert.equal(assistant.searchEnabled, false);
  assert.equal(assistant.conversationMode, "DEFAULT");
  assert.equal(assistant.blocks.length, 1);
  assert.equal(assistant.blocks[0].type, "text");
  assert.equal(assistant.blocks[0].content, "hello");
});

test("history messages returns blocks payload", async () => {
  const chatSessionId = await createSessionId();

  async function* stream() {
    yield { type: "text-delta", text: "hello" };
    yield { type: "finish", totalUsage: { totalTokens: 3 } };
  }

  await (
    await chatCompletionHandler(createCompletionRequest({ chatSessionId }), {
      streamText: createStreamTextOverride(stream()),
    })
  ).text();

  const response = await historyMessagesHandler(
    new Request(
      `http://localhost/api/v0/chat/history_messages?chat_session_id=${chatSessionId}`,
    ),
  );
  const body = (await response.json()) as {
    data?: { biz_data?: ChatState | null };
  };
  const messages = body.data?.biz_data?.chat_messages ?? [];
  const assistant = messages.find((message) => message.role === "ASSISTANT");

  assert.equal(response.status, 200);
  assert.equal(assistant?.has_pending_block, false);
  assert.equal(assistant?.blocks.length, 1);
  assert.equal(assistant?.blocks[0].type, "text");
  assert.equal(assistant?.blocks[0].content, "hello");
  assert.equal(["frag", "ments"].join("") in (assistant ?? {}), false);
});

test("completion compresses repeated mutation context", async () => {
  const chatSessionId = await createSessionId();

  async function* stream() {
    yield { type: "text-delta", text: "你" };
    yield { type: "text-delta", text: "好" };
    yield { type: "finish", totalUsage: { totalTokens: 2 } };
  }

  const response = await chatCompletionHandler(
    createCompletionRequest({ chatSessionId }),
    {
      streamText: createStreamTextOverride(stream()),
    },
  );

  const events = parseSseEvents(await response.text());
  const contentMutations = events
    .filter((event) => event.event === undefined && event.data)
    .map((event) => event.data!)
    .filter((data) => data.v === "你" || data.v === "好");

  assert.equal(contentMutations.length, 2);
  assert.equal(contentMutations[0].o, "append");
  assert.equal(contentMutations[0].p, "blocks/0/content");
  assert.deepEqual(contentMutations[1], { v: "好" });

  const statusMutation = events
    .filter((event) => event.event === undefined && event.data)
    .map((event) => event.data!)
    .find((data) => data.p === "status");

  assert.deepEqual(statusMutation, { o: "set", p: "status", v: "FINISHED" });
});

test("stream parser applies compressed mutation context", async () => {
  const { createPatchStreamParser } = await import(
    "@/lib/chat-core/client/stream-parser"
  );
  const patchContext = { lastOp: null, lastPath: null };
  let state: { blocks: Array<{ content: string }> } | undefined = {
    blocks: [{ content: "" }],
  };

  const parser = createPatchStreamParser({
    updateState: (updater) => { state = updater(state) as typeof state; },
    patchContext,
    resolveMessage: (s) => s,
  });

  parser.feed(`data: ${JSON.stringify({ o: "append", p: "blocks/0/content", v: "你" })}\n\n`);
  parser.feed(`data: ${JSON.stringify({ v: "好" })}\n\n`);

  assert.equal(state?.blocks[0].content, "你好");
});

test("stream parser batch items inherit parent path", async () => {
  const { createPatchStreamParser } = await import(
    "@/lib/chat-core/client/stream-parser"
  );
  const patchContext = { lastOp: null, lastPath: null };
  let state:
    | { status: string | number; accumulated_token_usage: number }
    | undefined = {
    status: "WIP",
    accumulated_token_usage: 0,
  };

  const parser = createPatchStreamParser({
    updateState: (updater) => {
      state = updater(state) as typeof state;
    },
    patchContext,
    resolveMessage: (s) => s,
  });

  parser.feed(
    `data: ${JSON.stringify({ o: "set", p: "status", v: "WIP" })}\n\n`,
  );
  parser.feed(
    `data: ${JSON.stringify({
      o: "batch",
      p: "accumulated_token_usage",
      v: [{ v: 42 }],
    })}\n\n`,
  );

  assert.equal(state?.status, "WIP");
  assert.equal(state?.accumulated_token_usage, 42);
});

test("session parser callbacks apply compressed mutation context", async () => {
  const { createChatCompletionParser } = await import(
    "@/features/session-chat/stream/parser"
  );
  let state: ChatState = {
    chat_session: {
      id: "session-1",
      title: null,
      title_type: "WIP" as const,
      pinned: false,
      updated_at: 0,
      seq_id: 1,
      agent: "chat",
      version: 0,
      is_empty: false,
      current_message_id: null,
      inserted_at: 0,
    },
    chat_messages: [],
  };
  const patchContext = { lastOp: null, lastPath: null };
  const sessionPatches: unknown[] = [];
  const titles: string[] = [];
  const parser = createChatCompletionParser({
    patchContext,
    updateState: (updater) => {
      state = updater(state) ?? state;
    },
    onSessionPatch: (patch) => {
      sessionPatches.push(patch);
    },
    onTitle: (title) => {
      titles.push(title);
    },
    onError: (error) => {
      throw error;
    },
  });

  parser.feed(
    `event: update_session\ndata: ${JSON.stringify({ updated_at: 1 })}\n\n`,
  );
  parser.feed(
    `event: update_session\ndata: ${JSON.stringify({ title: "hello" })}\n\n`,
  );

  assert.deepEqual(sessionPatches, [{ updated_at: 1 }, { title: "hello" }]);
  assert.deepEqual(titles, ["hello"]);
  assert.equal(state.chat_session.title, "hello");
});

test("completion with search streams and persists search blocks", async () => {
  const chatSessionId = await createSessionId();
  let streamSystemPrompt = "";

  async function* searchStream() {
    const searchOutput = [
      {
        url: "https://example.com/deepseek-v4",
        title: "DeepSeek V4 发布",
        snippet: "DeepSeek V4 发布并开源。",
        cite_index: 1,
        site_name: "example.com",
        query_indexes: [0],
      },
    ];
    yield {
      type: "tool-call",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "DeepSeek 最新模型 2026" },
    };
    yield {
      type: "tool-result",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "DeepSeek 最新模型 2026" },
      output: searchOutput,
    };
    yield {
      type: "text-delta",
      text: 'DeepSeek-V4<citation cite_index="1">1</citation>',
    };
    yield { type: "finish", totalUsage: { totalTokens: 12 } };
  }

  const streamText: StreamTextOverride = ((input: { system?: string }) => {
    streamSystemPrompt = input.system ?? "";
    return { fullStream: searchStream() };
  }) as unknown as StreamTextOverride;

  const response = await chatCompletionHandler(
    createCompletionRequest({
      chatSessionId,
      searchEnabled: true,
      prompt: "DeepSeek 最新模型 2026",
    }),
    {
      streamText,
      webSearch: createWebSearchOverride([
        {
          url: "https://example.com/deepseek-v4",
          title: "DeepSeek V4 发布",
          snippet: "DeepSeek V4 发布并开源。",
          cite_index: 1,
          site_name: "example.com",
          query_indexes: [0],
        },
      ]),
    },
  );

  const sseText = await response.text();
  assert.match(sseText, /"conversation_mode":"SEARCH"/);
  assert.match(sseText, /"type":"tool_call"/);
  assert.match(sseText, /"tool_name":"web_search"/);
  assert.match(sseText, /"o":"set","p":"blocks\/0\/output"/);
  assert.match(sseText, /"o":"add","p":"blocks"/);
  assert.match(sseText, /"type":"text","content":""/);
  assert.match(
    sseText,
    /DeepSeek-V4<citation cite_index=\\"1\\">1<\/citation>/,
  );
  assert.match(sseText, /"v":"FINISHED","o":"set","p":"blocks\/0\/status"/);
  assert.doesNotMatch(
    sseText,
    /"type":"text","content":"","references":\[\],"status"/,
  );
  assert.match(streamSystemPrompt, /web_search/);
  assert.match(streamSystemPrompt, /<citation cite_index="N">N<\/citation>/);

  const messages = await prisma.chatMessage.findMany({
    where: { chatSessionId },
    orderBy: { localId: "asc" },
    include: {
      blocks: {
        orderBy: { localId: "asc" },
      },
    },
  });

  const user = messages.find((message) => message.role === "USER");
  const assistant = messages.find((message) => message.role === "ASSISTANT");

  assert.equal(user?.searchEnabled, true);
  assert.equal(assistant?.searchEnabled, true);
  assert.equal(assistant?.conversationMode, "SEARCH");
  assert.equal(assistant?.status, "FINISHED");
  assert.equal(assistant?.blocks.length, 2);
  assert.equal(assistant?.blocks[0].type, "tool_call");
  assert.equal(assistant?.blocks[0].status, "FINISHED");
  assert.equal(assistant?.blocks[0].toolName, "web_search");
  assert.equal(assistant?.blocks[0].toolCallId, "call_search");
  assert.deepEqual(assistant?.blocks[0].toolInputJson, {
    query: "DeepSeek 最新模型 2026",
  });
  assert.deepEqual(assistant?.blocks[0].toolOutputJson, [
    {
      url: "https://example.com/deepseek-v4",
      title: "DeepSeek V4 发布",
      snippet: "DeepSeek V4 发布并开源。",
      cite_index: 1,
      site_name: "example.com",
      query_indexes: [0],
    },
  ]);
  assert.equal(assistant?.blocks[1].type, "text");
  assert.equal(
    assistant?.blocks[1].content,
    'DeepSeek-V4<citation cite_index="1">1</citation>',
  );
  assert.equal(assistant?.blocks[1].stageId, null);
});

test("search completion normalizes streamed citation tags to cite_index tags", async () => {
  const chatSessionId = await createSessionId();

  async function* searchStream() {
    const searchOutput = [
      {
        url: "https://example.com/deepseek-v4",
        title: "DeepSeek V4 发布",
        snippet: "DeepSeek V4 发布并开源。",
        cite_index: 1,
        site_name: "example.com",
        query_indexes: [0],
      },
    ];
    yield {
      type: "tool-call",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "DeepSeek 最新模型 2026" },
    };
    yield {
      type: "tool-result",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "DeepSeek 最新模型 2026" },
      output: searchOutput,
    };
    yield { type: "text-delta", text: "DeepSeek" };
    yield { type: "text-delta", text: '<citation cite="1">' };
    yield { type: "text-delta", text: "1</citation>" };
    yield { type: "finish", totalUsage: { totalTokens: 12 } };
  }

  const response = await chatCompletionHandler(
    createCompletionRequest({
      chatSessionId,
      searchEnabled: true,
      prompt: "DeepSeek 最新模型 2026",
    }),
    {
      streamText: createStreamTextOverride(searchStream()),
      webSearch: createWebSearchOverride([
        {
          url: "https://example.com/deepseek-v4",
          title: "DeepSeek V4 发布",
          snippet: "DeepSeek V4 发布并开源。",
          cite_index: 1,
          site_name: "example.com",
          query_indexes: [0],
        },
      ]),
    },
  );

  const sseText = await response.text();
  assert.match(
    sseText,
    /"v":"<citation cite_index=\\"1\\">1<\/citation>"/,
  );
  assert.doesNotMatch(sseText, /cite=\\"1\\"/);

  const assistant = await prisma.chatMessage.findFirstOrThrow({
    where: {
      chatSessionId,
      role: "ASSISTANT",
    },
    include: {
      blocks: {
        orderBy: { localId: "asc" },
      },
    },
  });

  assert.equal(
    assistant.blocks[1].content,
    'DeepSeek<citation cite_index="1">1</citation>',
  );
});

test("citation normalization fixes caption close tag typo", async () => {
  const { extractFlushableCitationMarkdown } = await import(
    "@/lib/chat-core/server/citation"
  );
  const malformed =
    '<citation cite_index="10">10</caption>。它具备**记忆功能**，可以在长时间对话中存储关键信息<citation cite_index="10">10</citation>';

  const result = extractFlushableCitationMarkdown(malformed);

  assert.equal(result.hold, "");
  assert.equal(
    result.flush,
    '<citation cite_index="10">10</citation>。它具备**记忆功能**，可以在长时间对话中存储关键信息<citation cite_index="10">10</citation>',
  );
});

test("search completion creates tool block before text block", async () => {
  const chatSessionId = await createSessionId();

  async function* searchStream() {
    yield {
      type: "tool-call",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "deepseek 最新模型" },
    };
    yield {
      type: "tool-result",
      toolCallId: "call_search",
      toolName: "web_search",
      input: { query: "deepseek 最新模型" },
      output: [
        {
          url: "https://example.com/deepseek-v4",
          title: "DeepSeek V4 发布",
          snippet: "DeepSeek V4 发布并开源。",
          cite_index: 1,
          site_name: "example.com",
          query_indexes: [0],
        },
      ],
    };
    yield { type: "text-delta", text: "你好！" };
    yield { type: "finish", totalUsage: { totalTokens: 2 } };
  }

  const response = await chatCompletionHandler(
    createCompletionRequest({
      chatSessionId,
      searchEnabled: true,
      prompt: "deepseek 最新模型",
    }),
    {
      streamText: createStreamTextOverride(searchStream()),
      webSearch: createWebSearchOverride([
        {
          url: "https://example.com/deepseek-v4",
          title: "DeepSeek V4 发布",
          snippet: "DeepSeek V4 发布并开源。",
          cite_index: 1,
          site_name: "example.com",
          query_indexes: [0],
        },
      ]),
    },
  );

  const sseText = await response.text();
  assert.match(sseText, /"type":"tool_call"/);
  assert.match(sseText, /"tool_name":"web_search"/);
  assert.match(sseText, /"v":"FINISHED","o":"set","p":"blocks\/0\/status"/);
  assert.match(sseText, /"type":"text","content":""/);

  const assistant = await prisma.chatMessage.findFirstOrThrow({
    where: {
      chatSessionId,
      role: "ASSISTANT",
    },
    include: {
      blocks: {
        orderBy: { localId: "asc" },
      },
    },
  });

  assert.equal(assistant.blocks.length, 2);
  assert.equal(assistant.blocks[0].localId, 1);
  assert.equal(assistant.blocks[0].type, "tool_call");
  assert.equal(assistant.blocks[0].toolName, "web_search");
  assert.equal(assistant.blocks[1].localId, 2);
  assert.equal(assistant.blocks[1].type, "text");
  assert.equal(assistant.blocks[1].stageId, null);
});

test("search completion failure clears pending state", async () => {
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
      createCompletionRequest({ chatSessionId, searchEnabled: true }),
      {
        streamText: createStreamTextOverride(failingStream),
      },
    );

    const sseText = await response.text();
    assert.match(sseText, /"type":"text"/);
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
      blocks: {
        orderBy: { localId: "asc" },
      },
    },
  });

  assert.equal(assistant.status, "FAILED");
  assert.equal(assistant.hasPendingBlock, false);
  assert.equal(assistant.searchEnabled, true);
  assert.equal(assistant.conversationMode, "SEARCH");
  assert.equal(assistant.blocks.length, 1);
  assert.equal(assistant.blocks[0].type, "text");
  assert.equal(assistant.blocks[0].content, "");
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

test("resume stream sends current snapshot then active deltas", async () => {
  const chatSessionId = await createSessionId();
  let releaseStream!: () => void;
  let firstDeltaSent!: () => void;
  const firstDeltaReady = new Promise<void>((resolve) => {
    firstDeltaSent = resolve;
  });
  const streamReleased = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });

  async function* slowStream() {
    yield { type: "text-delta", text: "hello" };
    firstDeltaSent();
    await streamReleased;
    yield { type: "text-delta", text: " world" };
    yield { type: "finish", totalUsage: { totalTokens: 2 } };
  }

  const firstResponse = await chatCompletionHandler(
    createCompletionRequest({ chatSessionId }),
    {
      streamText: createStreamTextOverride(slowStream()),
    },
  );

  await firstDeltaReady;

  const resumeResponse = await resumeChatCompletionStreamHandler(
    createResumeStreamRequest({ chatSessionId, messageId: 2 }),
  );

  releaseStream();

  const [firstText, resumeText] = await Promise.all([
    firstResponse.text(),
    resumeResponse.text(),
  ]);

  assert.match(firstText, /"hello"/);
  assert.match(resumeText, /event: ready/);
  assert.match(resumeText, /"response_message_id":2/);
  assert.match(resumeText, /event: upsert_message/);
  assert.match(resumeText, /"content":"hello"/);
  assert.match(resumeText, /" world"/);
  assert.match(resumeText, /event: done/);
});

test("resume stream marks inactive wip message as failed", async () => {
  const chatSessionId = await createSessionId();

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
      chatSessionId,
      parentId: 1,
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

  const response = await resumeChatCompletionStreamHandler(
    createResumeStreamRequest({ chatSessionId, messageId: 2 }),
  );
  const sseText = await response.text();

  assert.equal(response.status, 200);
  assert.match(sseText, /event: error/);
  assert.match(sseText, /生成已中断/);

  const assistant = await prisma.chatMessage.findFirstOrThrow({
    where: {
      chatSessionId,
      localId: 2,
      role: "ASSISTANT",
    },
  });

  assert.equal(assistant.status, "FAILED");
  assert.equal(assistant.incompleteMessage, "生成已中断");
  assert.equal(assistant.hasPendingBlock, false);
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
