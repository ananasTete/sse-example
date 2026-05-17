import {
  createDeepSeek,
  type DeepSeekLanguageModelOptions,
} from "@ai-sdk/deepseek";
import { stepCountIs, streamText } from "ai";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SSE_HEADERS, createSseResponse } from "@/src/server/http/sse";
import {
  bridgeAIStreamToPatches,
  createPatchEmitter,
  createWebSearchTool,
} from "@/lib/chat-core";
import { applyPathPatch } from "@/lib/chat-core/client/patch-apply";
import type { PatchEmitter, PatchOp, WebSearchFn } from "@/lib/chat-core";

// 最新配置，不要改这里
const MODEL_API_KEY_ENV = ["DEEP", "SEEK_API_KEY"].join("");
const MODEL_API_BASE_URL_ENV = ["DEEP", "SEEK_API_BASE_URL"].join("");
const MODEL_NAME_ENV = ["DEEP", "SEEK_MODEL"].join("");
const DEFAULT_MODEL_API_BASE_URL = ["https://api.", "deep", "seek.com"].join(
  "",
);
const DEFAULT_MODEL_NAME = ["deep", "seek-v4-flash"].join("");
const SEARCH_SYSTEM_PROMPT = [
  "你可以使用 web_search 工具搜索网络获取最新信息。",
  "当用户启用网络搜索时，应先调用 web_search，再基于工具结果回答。",
  '引用来源时使用 <citation cite_index="N">N</citation>，N 对应搜索结果编号。',
  "搜索结果无法支持的内容，直接说明当前搜索结果未提供。",
].join("\n");

interface CompletionRequestBody {
  chat_session_id: string;
  parent_message_id: number | null;
  prompt: string;
  at_references: AtReference[];
  ref_file_ids: string[];
  thinking_enabled: boolean;
  search_enabled: boolean;
  preempt: boolean;
}

interface DocumentSelectionReference {
  type: "selection";
  content_with_selection: string;
  is_full_content: boolean;
  origin_id: string;
  origin_type: "document";
}

type AtReference = DocumentSelectionReference;

interface ResumeStreamRequestBody {
  chat_session_id: string;
  message_id: number;
}

interface ChatCompletionHandlerOptions {
  streamText?: typeof streamText;
  webSearch?: WebSearchFn;
}

class CompletionHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const activeCompletionControllers = new Map<string, ActiveCompletionRun>();

interface ActiveCompletionRun {
  chatSessionId: string;
  assistantMessageDbId: number;
  assistantMessageLocalId: number;
  userMessageLocalId: number;
  controller: AbortController;
  subscribers: Set<ActiveCompletionSubscriber>;
  snapshot: Record<string, unknown> | null;
  patchContext: { lastOp: PatchOp | null; lastPath: string | null };
}

interface ActiveCompletionSubscriber {
  emitter: PatchEmitter;
  close: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

function parseAtReferences(value: unknown): AtReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("at_references must be an array");
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (item.type !== "selection") return [];

    if (
      typeof item.content_with_selection !== "string" ||
      !/<selection>[\s\S]+<\/selection>/i.test(item.content_with_selection) ||
      typeof item.origin_id !== "string" ||
      !item.origin_id.trim()
    ) {
      throw new Error("selection reference is invalid");
    }

    return [
      {
        type: "selection",
        content_with_selection: item.content_with_selection,
        is_full_content:
          typeof item.is_full_content === "boolean"
            ? item.is_full_content
            : false,
        origin_id: item.origin_id.trim(),
        origin_type: "document",
      } satisfies DocumentSelectionReference,
    ];
  });
}

function buildPromptWithReferences(prompt: string, references: AtReference[]) {
  if (references.length === 0) return prompt;

  const referenceText = references
    .map((reference, index) => {
      return [
        `[reference ${index + 1}: selection]`,
        `origin_id: ${reference.origin_id}`,
        `is_full_content: ${reference.is_full_content ? "true" : "false"}`,
        reference.content_with_selection,
        `[/reference ${index + 1}]`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "用户请求：",
    prompt,
    "",
    "引用内容如下。<selection>...</selection> 标记用户当前选区：",
    referenceText,
  ].join("\n");
}

function parseCompletionRequestBody(body: unknown): CompletionRequestBody {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const chatSessionId = body.chat_session_id;
  const prompt = body.prompt;
  const parentMessageId = body.parent_message_id;

  if (typeof chatSessionId !== "string" || !chatSessionId.trim()) {
    throw new Error("chat_session_id is required");
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt is required");
  }

  if (
    parentMessageId !== null &&
    parentMessageId !== undefined &&
    (typeof parentMessageId !== "number" ||
      !Number.isSafeInteger(parentMessageId) ||
      parentMessageId <= 0)
  ) {
    throw new Error("parent_message_id must be a positive integer");
  }

  return {
    chat_session_id: chatSessionId.trim(),
    parent_message_id: parentMessageId ?? null,
    prompt: prompt.trim(),
    at_references: parseAtReferences(body.at_references),
    ref_file_ids: Array.isArray(body.ref_file_ids)
      ? body.ref_file_ids.filter(
          (fileId): fileId is string => typeof fileId === "string",
        )
      : [],
    thinking_enabled:
      typeof body.thinking_enabled === "boolean"
        ? body.thinking_enabled
        : false,
    search_enabled:
      typeof body.search_enabled === "boolean" ? body.search_enabled : false,
    preempt: typeof body.preempt === "boolean" ? body.preempt : false,
  };
}

function parseResumeStreamRequestBody(body: unknown): ResumeStreamRequestBody {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const chatSessionId = body.chat_session_id;
  const messageId = body.message_id;

  if (typeof chatSessionId !== "string" || !chatSessionId.trim()) {
    throw new Error("chat_session_id is required");
  }

  if (
    typeof messageId !== "number" ||
    !Number.isSafeInteger(messageId) ||
    messageId <= 0
  ) {
    throw new Error("message_id must be a positive integer");
  }

  return {
    chat_session_id: chatSessionId.trim(),
    message_id: messageId,
  };
}

function toResponseMessagePayload(input: {
  messageId: number;
  parentId: number;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  insertedAt: Date;
  blocks?: unknown[];
  hasPendingBlock?: boolean;
}) {
  return {
    message_id: input.messageId,
    parent_id: input.parentId,
    model: "",
    role: "ASSISTANT",
    thinking_enabled: input.thinkingEnabled,
    ban_edit: false,
    ban_regenerate: false,
    status: "WIP",
    incomplete_message: null,
    accumulated_token_usage: 0,
    feedback: null,
    inserted_at: toEpochSeconds(input.insertedAt),
    search_enabled: input.searchEnabled,
    blocks: input.blocks ?? [],
    conversation_mode: input.searchEnabled ? "SEARCH" : "DEFAULT",
    has_pending_block: input.hasPendingBlock ?? false,
    auto_continue: false,
  };
}

function createCompletionErrorSseResponse(message: string, status: number) {
  const stream = new ReadableStream({
    start(controller) {
      createPatchEmitter(controller).sendError({ message });
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: SSE_HEADERS,
  });
}

function createLifecycleSseResponse(
  event: "done" | "error",
  data: Record<string, unknown>,
  status = 200,
) {
  const stream = new ReadableStream({
    start(controller) {
      const emitter = createPatchEmitter(controller);
      if (event === "done")
        emitter.sendDone(
          data as { status: "finished" | "failed" | "cancelled" },
        );
      else emitter.sendError(data as { message: string; code?: string });
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: SSE_HEADERS,
  });
}

function cloneRecord(value: Record<string, unknown>) {
  return structuredClone(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toSnapshotBlock(block: {
  type: string;
  status: string | null;
  content: string | null;
  toolName: string | null;
  toolCallId: string | null;
  toolInputJson: unknown;
  toolOutputJson: unknown;
  queriesJson: unknown;
  resultsJson: unknown;
  referencesJson: unknown;
  stageId: number | null;
}) {
  if (block.type === "text") {
    return {
      type: "text",
      content: block.content ?? "",
      references: asArray(block.referencesJson),
      stage_id: block.stageId,
    };
  }

  if (block.type === "reasoning") {
    return {
      type: "reasoning",
      content: block.content ?? "",
    };
  }

  if (block.type === "tool_call") {
    const input = block.toolInputJson != null ? [block.toolInputJson] : [];
    const output =
      block.toolName === "web_search"
        ? asArray(block.toolOutputJson)
        : block.toolOutputJson != null
          ? [block.toolOutputJson]
          : [];

    return {
      type: "tool_call",
      status: block.status ?? "FINISHED",
      content: block.content,
      tool_name: block.toolName ?? "unknown",
      tool_call_id: block.toolCallId ?? "",
      input,
      output,
    };
  }

  if (block.type === "search") {
    return {
      type: "search",
      status: block.status ?? "FINISHED",
      content: block.content,
      queries: asArray(block.queriesJson),
      results: asArray(block.resultsJson),
    };
  }

  return {
    type: block.type,
    content: block.content ?? "",
    references: asArray(block.referencesJson),
    stage_id: block.stageId,
  };
}

function toMessageSnapshot(message: {
  localId: number;
  parentId: number | null;
  model: string;
  role: string;
  thinkingEnabled: boolean;
  banEdit: boolean;
  banRegenerate: boolean;
  status: string;
  incompleteMessage: string | null;
  accumulatedTokenUsage: number;
  feedback: unknown;
  insertedAt: Date;
  searchEnabled: boolean;
  conversationMode: string;
  hasPendingBlock: boolean;
  autoContinue: boolean;
  blocks: Array<{
    type: string;
    status: string | null;
    content: string | null;
    toolName: string | null;
    toolCallId: string | null;
    toolInputJson: unknown;
    toolOutputJson: unknown;
    queriesJson: unknown;
    resultsJson: unknown;
    referencesJson: unknown;
    stageId: number | null;
  }>;
}) {
  return {
    message_id: message.localId,
    parent_id: message.parentId,
    model: message.model,
    role: message.role,
    thinking_enabled: message.thinkingEnabled,
    ban_edit: message.banEdit,
    ban_regenerate: message.banRegenerate,
    status: message.status,
    incomplete_message: message.incompleteMessage,
    accumulated_token_usage: message.accumulatedTokenUsage,
    feedback: message.feedback,
    inserted_at: toEpochSeconds(message.insertedAt),
    search_enabled: message.searchEnabled,
    blocks: message.blocks.map(toSnapshotBlock),
    conversation_mode: message.conversationMode,
    has_pending_block: message.hasPendingBlock,
    auto_continue: message.autoContinue,
  };
}

function createResumeSnapshotSseResponse(input: {
  chatSessionId: string;
  responseMessageId: number;
  userMessageId: number;
  snapshot: Record<string, unknown>;
  terminal:
    | { event: "done"; data: Parameters<PatchEmitter["sendDone"]>[0] }
    | { event: "error"; data: Parameters<PatchEmitter["sendError"]>[0] };
}) {
  const stream = new ReadableStream({
    start(controller) {
      const emitter = createPatchEmitter(controller);
      emitter.sendReady({
        response_message_id: input.responseMessageId,
        user_message_id: input.userMessageId,
        session_id: input.chatSessionId,
      });
      emitter.sendUpsertMessage(input.snapshot);

      if (input.terminal.event === "done") {
        emitter.sendDone(input.terminal.data);
      } else {
        emitter.sendError(input.terminal.data);
      }

      controller.close();
    },
  });

  return createSseResponse(stream);
}

function applyPatchToRunSnapshot(
  run: ActiveCompletionRun,
  o: PatchOp,
  p: string,
  v: unknown,
) {
  if (!run.snapshot) return;

  // Save previous non-batch op for batch item inheritance.
  const prevOp =
    run.patchContext.lastOp !== "batch" ? run.patchContext.lastOp : null;

  // Update sticky context
  run.patchContext.lastOp = o;
  run.patchContext.lastPath = p;

  if (o === "batch" && Array.isArray(v)) {
    for (const item of v as import("@/lib/chat-core").BatchItem[]) {
      const itemOp = item.o ?? prevOp;
      if (!itemOp) continue;
      applyPathPatch(run.snapshot, item.p ?? p, itemOp, item.v);
    }
  } else if (o !== "batch") {
    applyPathPatch(run.snapshot, p, o, v);
  }
}

function upsertRunSnapshot(
  run: ActiveCompletionRun,
  message: Record<string, unknown>,
) {
  run.snapshot = cloneRecord(message);
}

function sendRunReady(
  run: ActiveCompletionRun,
  data: Parameters<PatchEmitter["sendReady"]>[0],
) {
  for (const sub of [...run.subscribers]) {
    try {
      sub.emitter.sendReady(data);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function sendRunUpsertMessage(
  run: ActiveCompletionRun,
  message: Record<string, unknown>,
) {
  upsertRunSnapshot(run, message);
  for (const sub of [...run.subscribers]) {
    try {
      sub.emitter.sendUpsertMessage(message);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function sendRunSession(
  run: ActiveCompletionRun,
  data: Parameters<PatchEmitter["sendSession"]>[0],
) {
  for (const sub of [...run.subscribers]) {
    try {
      sub.emitter.sendSession(data);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function sendRunDone(
  run: ActiveCompletionRun,
  data: Parameters<PatchEmitter["sendDone"]>[0],
) {
  for (const sub of [...run.subscribers]) {
    try {
      sub.emitter.sendDone(data);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function sendRunError(
  run: ActiveCompletionRun,
  data: Parameters<PatchEmitter["sendError"]>[0],
) {
  for (const sub of [...run.subscribers]) {
    try {
      sub.emitter.sendError(data);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function sendRunPatch(
  run: ActiveCompletionRun,
  o: PatchOp,
  p: string,
  v: unknown,
) {
  applyPatchToRunSnapshot(run, o, p, v);
  for (const sub of [...run.subscribers]) {
    try {
      sub.emitter.sendPatch(o, p, v);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function addRunSubscriber(
  run: ActiveCompletionRun,
  subscriber: ActiveCompletionSubscriber,
) {
  run.subscribers.add(subscriber);

  return () => {
    run.subscribers.delete(subscriber);
  };
}

function closeRunSubscribers(run: ActiveCompletionRun) {
  for (const subscriber of [...run.subscribers]) {
    run.subscribers.delete(subscriber);
    try {
      subscriber.close();
    } catch {
      // The connection may already be closed by the client.
    }
  }
}

async function createCompletionTurn(body: CompletionRequestBody) {
  return prisma.$transaction(async (tx) => {
    const reservedSession = await tx.chatSession.update({
      where: { id: body.chat_session_id },
      data: {
        nextMessageId: { increment: 2 },
      },
      select: {
        nextMessageId: true,
      },
    });

    const activeAssistantMessage = await tx.chatMessage.findFirst({
      where: {
        chatSessionId: body.chat_session_id,
        role: "ASSISTANT",
        status: "WIP",
      },
      select: { id: true },
      orderBy: { insertedAt: "desc" },
    });

    if (activeAssistantMessage) {
      if (!body.preempt) {
        throw new CompletionHttpError(
          "A completion is already in progress",
          409,
        );
      }

      await tx.chatMessage.updateMany({
        where: {
          chatSessionId: body.chat_session_id,
          role: "ASSISTANT",
          status: "WIP",
        },
        data: {
          status: "FAILED",
          incompleteMessage: "Completion preempted",
          hasPendingBlock: false,
        },
      });
    }

    if (body.parent_message_id !== null) {
      const parentMessage = await tx.chatMessage.findFirst({
        where: {
          chatSessionId: body.chat_session_id,
          localId: body.parent_message_id,
        },
        select: { localId: true },
      });

      if (!parentMessage) {
        throw new CompletionHttpError("parent_message_id is invalid", 400);
      }
    }

    const userMessageLocalId = reservedSession.nextMessageId - 1;
    const assistantMessageLocalId = reservedSession.nextMessageId;

    const userMessage = await tx.chatMessage.create({
      data: {
        localId: userMessageLocalId,
        chatSessionId: body.chat_session_id,
        parentId: body.parent_message_id,
        role: "USER",
        status: "FINISHED",
        accumulatedTokenUsage: body.prompt.length,
        searchEnabled: body.search_enabled,
        blocks: {
          create: {
            localId: 1,
            type: "text",
            content: body.prompt,
            referencesJson:
              body.at_references as unknown as Prisma.InputJsonArray,
          },
        },
      },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        localId: assistantMessageLocalId,
        chatSessionId: body.chat_session_id,
        parentId: userMessage.localId,
        role: "ASSISTANT",
        status: "WIP",
        thinkingEnabled: body.thinking_enabled,
        searchEnabled: body.search_enabled,
        conversationMode: body.search_enabled ? "SEARCH" : "DEFAULT",
        hasPendingBlock: true,
      },
    });

    const updatedSession = await tx.chatSession.update({
      where: { id: body.chat_session_id },
      data: {
        currentMessageId: assistantMessage.localId,
        isEmpty: false,
        version: { increment: 1 },
      },
      select: { updatedAt: true },
    });

    return {
      userMessage,
      assistantMessage,
      updatedSession,
    };
  });
}

export async function chatCompletionHandler(
  request: Request,
  options: ChatCompletionHandlerOptions = {},
) {
  const apiKey = process.env[MODEL_API_KEY_ENV];
  if (!apiKey) {
    return createCompletionErrorSseResponse(
      `Missing ${MODEL_API_KEY_ENV} environment variable`,
      500,
    );
  }

  let body: CompletionRequestBody;
  try {
    body = parseCompletionRequestBody(await request.json());
  } catch (error) {
    return createCompletionErrorSseResponse(
      error instanceof Error ? error.message : "Invalid request body",
      400,
    );
  }

  let turn: Awaited<ReturnType<typeof createCompletionTurn>>;
  try {
    turn = await createCompletionTurn(body);
  } catch (error) {
    const status =
      error instanceof CompletionHttpError
        ? error.status
        : error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ? 404
          : 500;
    const message =
      error instanceof CompletionHttpError
        ? error.message
        : status === 404
          ? "Chat session not found"
          : "Failed to create completion";

    return createCompletionErrorSseResponse(message, status);
  }

  if (body.preempt) {
    activeCompletionControllers.get(body.chat_session_id)?.controller.abort();
  }

  const completionController = new AbortController();
  const activeRun: ActiveCompletionRun = {
    chatSessionId: body.chat_session_id,
    assistantMessageDbId: turn.assistantMessage.id,
    assistantMessageLocalId: turn.assistantMessage.localId,
    userMessageLocalId: turn.userMessage.localId,
    controller: completionController,
    subscribers: new Set(),
    snapshot: toResponseMessagePayload({
      messageId: turn.assistantMessage.localId,
      parentId: turn.userMessage.localId,
      thinkingEnabled: body.thinking_enabled,
      searchEnabled: body.search_enabled,
      insertedAt: turn.assistantMessage.insertedAt,
      blocks: [],
      hasPendingBlock: true,
    }),
    patchContext: { lastOp: null, lastPath: null },
  };
  activeCompletionControllers.set(body.chat_session_id, activeRun);

  const modelProvider = createDeepSeek({
    apiKey,
    baseURL: process.env[MODEL_API_BASE_URL_ENV] ?? DEFAULT_MODEL_API_BASE_URL,
  });

  const streamTextFn = options.streamText ?? streamText;
  const webSearch = options.webSearch;

  let unsubscribeMain: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const mainSubscriber = {
        emitter: createPatchEmitter(controller),
        close: () => controller.close(),
      };
      unsubscribeMain = addRunSubscriber(activeRun, mainSubscriber);
      const emitter = {
        sendReady: (data: Parameters<PatchEmitter["sendReady"]>[0]) =>
          sendRunReady(activeRun, data),
        sendUpsertMessage: (msg: Record<string, unknown>) =>
          sendRunUpsertMessage(activeRun, msg),
        sendSession: (data: Parameters<PatchEmitter["sendSession"]>[0]) =>
          sendRunSession(activeRun, data),
        sendDone: (data: Parameters<PatchEmitter["sendDone"]>[0]) =>
          sendRunDone(activeRun, data),
        sendError: (data: Parameters<PatchEmitter["sendError"]>[0]) =>
          sendRunError(activeRun, data),
        sendPatch: (o: PatchOp, p: string, v: unknown) =>
          sendRunPatch(activeRun, o, p, v),
        sendBatch: (
          p: string,
          items: Parameters<PatchEmitter["sendBatch"]>[1],
        ) => sendRunPatch(activeRun, "batch", p, items),
      } satisfies PatchEmitter;
      const createdBlockIds = new Set<number>();
      const responseBlockDbIdByLocalId = new Map<number, number>();
      const responseContentByLocalId = new Map<number, string>();
      const lastPersistedContentByLocalId = new Map<number, string>();
      const lastPersistedAtByLocalId = new Map<number, number>();
      let tokenUsage = 0;
      let responseInitialized = false;

      const toInputJson = (value: unknown) =>
        value === undefined
          ? Prisma.JsonNull
          : (value as Prisma.InputJsonValue);

      const sendInitialResponse = () => {
        responseInitialized = true;
        emitter.sendUpsertMessage(
          toResponseMessagePayload({
            messageId: turn.assistantMessage.localId,
            parentId: turn.userMessage.localId,
            thinkingEnabled: body.thinking_enabled,
            searchEnabled: body.search_enabled,
            insertedAt: turn.assistantMessage.insertedAt,
            blocks: [],
            hasPendingBlock: false,
          }),
        );
      };

      const ensureResponseInitialized = () => {
        if (responseInitialized) return;
        sendInitialResponse();
      };

      const createResponseBlock = async (blockIndex: number) => {
        if (responseBlockDbIdByLocalId.has(blockIndex)) return;

        const block = await prisma.messageBlock.create({
          data: {
            localId: blockIndex + 1,
            messageId: turn.assistantMessage.id,
            type: "text",
            content: "",
            referencesJson: [] as Prisma.InputJsonArray,
            stageId: null,
          },
        });

        createdBlockIds.add(blockIndex);
        responseBlockDbIdByLocalId.set(blockIndex, block.id);
        responseContentByLocalId.set(blockIndex, "");
        lastPersistedContentByLocalId.set(blockIndex, "");
        lastPersistedAtByLocalId.set(blockIndex, Date.now());
      };

      const ensureEmptyResponseBlock = async () => {
        if (createdBlockIds.size > 0) return;

        const blockIndex = 0;
        await createResponseBlock(blockIndex);
        emitter.sendPatch("add", "blocks", {
          type: "text",
          content: "",
          references: [],
        });
      };

      const persistContent = async (localId: number, force = false) => {
        const blockDbId = responseBlockDbIdByLocalId.get(localId);
        if (blockDbId === undefined) return;

        const content = responseContentByLocalId.get(localId) ?? "";
        if (content === lastPersistedContentByLocalId.get(localId)) return;
        const now = Date.now();
        const lastPersistedAt = lastPersistedAtByLocalId.get(localId) ?? 0;
        if (!force && now - lastPersistedAt < 500) return;

        await prisma.messageBlock.update({
          where: { id: blockDbId },
          data: {
            content,
          },
        });
        lastPersistedContentByLocalId.set(localId, content);
        lastPersistedAtByLocalId.set(localId, now);
      };

      const persistAllContent = async (force = false) => {
        for (const localId of responseBlockDbIdByLocalId.keys()) {
          await persistContent(localId, force);
        }
      };

      const createToolCallBlock = async (
        blockIndex: number,
        toolName: string,
        toolCallId: string,
        input: unknown,
      ) => {
        await prisma.messageBlock.create({
          data: {
            localId: blockIndex + 1,
            messageId: turn.assistantMessage.id,
            type: "tool_call",
            status: "WIP",
            content: null,
            toolName,
            toolCallId,
            toolInputJson: toInputJson(input),
            toolOutputJson: Prisma.JsonNull,
          },
        });
        createdBlockIds.add(blockIndex);
      };

      const updateToolCallBlock = async (
        blockIndex: number,
        status: "FINISHED" | "FAILED",
        output: unknown,
      ) => {
        await prisma.messageBlock.update({
          where: {
            messageId_localId: {
              messageId: turn.assistantMessage.id,
              localId: blockIndex + 1,
            },
          },
          data: {
            status,
            toolOutputJson: toInputJson(output),
          },
        });
      };

      emitter.sendReady({
        response_message_id: turn.assistantMessage.localId,
        user_message_id: turn.userMessage.localId,
        session_id: body.chat_session_id,
      });

      emitter.sendSession({
        updated_at: toEpochSeconds(turn.updatedSession.updatedAt),
      });

      try {
        const tools = body.search_enabled
          ? { web_search: createWebSearchTool({ search: webSearch }) }
          : undefined;
        const result = streamTextFn({
          model: modelProvider.chat(
            process.env[MODEL_NAME_ENV] ?? DEFAULT_MODEL_NAME,
          ),
          ...(body.search_enabled ? { system: SEARCH_SYSTEM_PROMPT } : {}),
          ...(tools ? { tools, stopWhen: stepCountIs(5) } : {}),
          prompt: buildPromptWithReferences(body.prompt, body.at_references),
          abortSignal: completionController.signal,
          providerOptions: {
            deepseek: {
              thinking: {
                type: body.thinking_enabled ? "enabled" : "disabled",
              },
            } satisfies DeepSeekLanguageModelOptions,
          },
        });

        await bridgeAIStreamToPatches(result.fullStream, {
          emitter,
          responseMessageId: turn.assistantMessage.localId,
          onBeforeFirstPatch: ensureResponseInitialized,
          onResponseBlock: createResponseBlock,
          onToolCall: createToolCallBlock,
          onToolResult: (blockIndex, _toolCallId, output) =>
            updateToolCallBlock(blockIndex, "FINISHED", output),
          onToolError: (blockIndex, _toolCallId, error) =>
            updateToolCallBlock(blockIndex, "FAILED", error),
          transformToolOutput: (toolName, output) => {
            if (toolName === "web_search") {
              return Array.isArray(output) ? output : [];
            }
            return [output];
          },
          transformToolInput: (toolName, input) => {
            if (
              toolName === "web_search" &&
              typeof input === "object" &&
              input !== null &&
              "query" in input
            ) {
              return [input];
            }
            return [input];
          },
          onContentAppend: async (blockIndex, contentDelta) => {
            responseContentByLocalId.set(
              blockIndex,
              `${responseContentByLocalId.get(blockIndex) ?? ""}${contentDelta}`,
            );
            await persistContent(blockIndex);
          },
          onFinish: (usage) => {
            tokenUsage = usage.totalTokens ?? 0;
          },
        });

        await persistAllContent(true);

        const finished = await prisma.$transaction(async (tx) => {
          const updateResult = await tx.chatMessage.updateMany({
            where: { id: turn.assistantMessage.id, status: "WIP" },
            data: {
              status: "FINISHED",
              accumulatedTokenUsage: tokenUsage,
              hasPendingBlock: false,
            },
          });

          if (updateResult.count === 0) {
            return null;
          }

          const assistantMessage = await tx.chatMessage.findUniqueOrThrow({
            where: { id: turn.assistantMessage.id },
          });

          const session = await tx.chatSession.update({
            where: { id: body.chat_session_id },
            data: {
              title: body.prompt.slice(0, 30),
              titleType: "SYSTEM",
              version: { increment: 1 },
            },
            select: { updatedAt: true, title: true },
          });

          return { assistantMessage, session };
        });

        if (!finished) {
          emitter.sendDone({ status: "cancelled" });
          return;
        }

        emitter.sendPatch("set", "accumulated_token_usage", tokenUsage);
        emitter.sendPatch("set", "status", finished.assistantMessage.status);

        emitter.sendSession({
          updated_at: toEpochSeconds(finished.session.updatedAt),
          title: finished.session.title ?? "新会话",
        });

        emitter.sendDone({ status: "finished" });
      } catch (error) {
        if (!responseInitialized) {
          ensureResponseInitialized();
        }
        await ensureEmptyResponseBlock();

        try {
          await persistAllContent(true);
        } catch (persistError) {
          console.error("Failed to persist partial completion", persistError);
        }

        const errorMessage = completionController.signal.aborted
          ? "Completion aborted"
          : "Completion failed";
        console.error("Chat completion stream failed", error);

        await prisma.chatMessage.updateMany({
          where: { id: turn.assistantMessage.id, status: "WIP" },
          data: {
            status: "FAILED",
            incompleteMessage: errorMessage,
            hasPendingBlock: false,
          },
        });

        if (responseInitialized) {
          emitter.sendPatch("set", "status", "FAILED");
        }

        emitter.sendError({ message: errorMessage });
        emitter.sendDone({ status: "failed" });
      } finally {
        const activeController = activeCompletionControllers.get(
          body.chat_session_id,
        );
        unsubscribeMain?.();
        unsubscribeMain = null;
        if (
          activeController?.assistantMessageDbId === turn.assistantMessage.id
        ) {
          activeCompletionControllers.delete(body.chat_session_id);
        }
        closeRunSubscribers(activeRun);
        try {
          controller.close();
        } catch {
          // The primary connection may already be closed by the client.
        }
      }
    },
    cancel() {
      unsubscribeMain?.();
      unsubscribeMain = null;
    },
  });

  return createSseResponse(stream);
}

export async function resumeChatCompletionStreamHandler(request: Request) {
  let body: ResumeStreamRequestBody;
  try {
    body = parseResumeStreamRequestBody(await request.json());
  } catch (error) {
    return createLifecycleSseResponse(
      "error",
      {
        message:
          error instanceof Error ? error.message : "Invalid request body",
      },
      400,
    );
  }

  const activeRun = activeCompletionControllers.get(body.chat_session_id);

  if (activeRun && activeRun.assistantMessageLocalId === body.message_id) {
    let unsubscribe: (() => void) | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const emitter = createPatchEmitter(controller);

        emitter.sendReady({
          response_message_id: activeRun.assistantMessageLocalId,
          user_message_id: activeRun.userMessageLocalId,
          session_id: body.chat_session_id,
        });

        if (activeRun.snapshot) {
          emitter.sendUpsertMessage(cloneRecord(activeRun.snapshot));
        }

        unsubscribe = addRunSubscriber(activeRun, {
          emitter,
          close: () => controller.close(),
        });

        request.signal.addEventListener(
          "abort",
          () => {
            unsubscribe?.();
            unsubscribe = null;
          },
          { once: true },
        );
      },
      cancel() {
        unsubscribe?.();
        unsubscribe = null;
      },
    });

    return createSseResponse(stream);
  }

  let message = await prisma.chatMessage.findFirst({
    where: {
      chatSessionId: body.chat_session_id,
      localId: body.message_id,
      role: "ASSISTANT",
    },
    include: {
      blocks: {
        orderBy: { localId: "asc" },
      },
    },
  });

  if (!message) {
    return createLifecycleSseResponse(
      "error",
      { message: "message_id is invalid" },
      404,
    );
  }

  if (message.status === "FINISHED") {
    return createResumeSnapshotSseResponse({
      chatSessionId: body.chat_session_id,
      responseMessageId: message.localId,
      userMessageId: message.parentId ?? 0,
      snapshot: toMessageSnapshot(message),
      terminal: { event: "done", data: { status: "finished" } },
    });
  }

  if (message.status === "WIP") {
    await prisma.chatMessage.updateMany({
      where: {
        chatSessionId: body.chat_session_id,
        localId: body.message_id,
        role: "ASSISTANT",
        status: "WIP",
      },
      data: {
        status: "FAILED",
        incompleteMessage: "生成已中断",
        hasPendingBlock: false,
      },
    });

    message = await prisma.chatMessage.findFirstOrThrow({
      where: {
        chatSessionId: body.chat_session_id,
        localId: body.message_id,
        role: "ASSISTANT",
      },
      include: {
        blocks: {
          orderBy: { localId: "asc" },
        },
      },
    });
  }

  return createResumeSnapshotSseResponse({
    chatSessionId: body.chat_session_id,
    responseMessageId: message.localId,
    userMessageId: message.parentId ?? 0,
    snapshot: toMessageSnapshot(message),
    terminal: {
      event: "error",
      data: { message: message.incompleteMessage ?? "生成已中断" },
    },
  });
}
