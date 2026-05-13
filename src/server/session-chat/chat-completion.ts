import {
  createDeepSeek,
  type DeepSeekLanguageModelOptions,
} from "@ai-sdk/deepseek";
import { stepCountIs, streamText } from "ai";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SSE_HEADERS,
  createSseResponse,
  sendSseFrame,
} from "@/src/server/http/sse";
import {
  bridgeAIStreamToPatches,
  createMutationEmitter,
  createWebSearchTool,
} from "@/lib/chat-core";
import { applyPathPatch } from "@/lib/chat-core/client/patch-apply";
import type { MutationEmitter, Target, WebSearchFn } from "@/lib/chat-core";

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
  ref_file_ids: string[];
  thinking_enabled: boolean;
  search_enabled: boolean;
  preempt: boolean;
}

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

const activeCompletionControllers = new Map<
  string,
  ActiveCompletionRun
>();

interface ActiveCompletionRun {
  chatSessionId: string;
  assistantMessageDbId: number;
  assistantMessageLocalId: number;
  userMessageLocalId: number;
  controller: AbortController;
  subscribers: Set<ActiveCompletionSubscriber>;
  snapshot: Record<string, unknown> | null;
}

interface ActiveCompletionSubscriber {
  emitter: MutationEmitter;
  close: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

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
      const encoder = new TextEncoder();
      sendSseFrame(controller, encoder, {
        event: "lifecycle",
        data: {
          type: "error",
          message,
        },
      });
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
      const emitter = createMutationEmitter(controller);
      emitter.sendLifecycle(event, data);
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

function resolveSnapshotTarget(snapshot: Record<string, unknown>, target: Target) {
  if (target.type === "message") {
    return Number(target.id) === Number(snapshot.message_id) ? snapshot : null;
  }

  if (target.type !== "block") return null;

  const blocks = snapshot.blocks;
  if (!Array.isArray(blocks)) return null;

  return (
    blocks.find(
      (block) =>
        isRecord(block) && Number(block.id) === Number(target.id),
    ) ?? null
  );
}

function applyMutationToRunSnapshot(
  run: ActiveCompletionRun,
  mutation: Parameters<MutationEmitter["sendMutation"]>[0],
) {
  if (
    mutation.target.type === "message" &&
    Number(mutation.target.id) === run.assistantMessageLocalId &&
    mutation.op === "upsert" &&
    mutation.path === "" &&
    isRecord(mutation.value)
  ) {
    run.snapshot = cloneRecord(mutation.value);
    return;
  }

  if (!run.snapshot) return;

  const target = resolveSnapshotTarget(run.snapshot, mutation.target);
  if (!target) return;

  if (mutation.path) {
    applyPathPatch(target, mutation.path, mutation.op, mutation.value);
  }
}

function sendRunLifecycle(
  run: ActiveCompletionRun,
  type: Parameters<MutationEmitter["sendLifecycle"]>[0],
  data?: Record<string, unknown>,
) {
  for (const subscriber of [...run.subscribers]) {
    try {
      subscriber.emitter.sendLifecycle(type, data);
    } catch {
      run.subscribers.delete(subscriber);
    }
  }
}

function sendRunMutation(
  run: ActiveCompletionRun,
  mutation: Parameters<MutationEmitter["sendMutation"]>[0],
) {
  applyMutationToRunSnapshot(run, mutation);

  for (const subscriber of [...run.subscribers]) {
    try {
      subscriber.emitter.sendMutation(mutation);
    } catch {
      run.subscribers.delete(subscriber);
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
            type: "request",
            content: body.prompt,
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
    snapshot: null,
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
        emitter: createMutationEmitter(controller),
        close: () => controller.close(),
      };
      unsubscribeMain = addRunSubscriber(activeRun, mainSubscriber);
      const emitter: MutationEmitter = {
        sendLifecycle: (type, data) => sendRunLifecycle(activeRun, type, data),
        sendMutation: (mutation) => sendRunMutation(activeRun, mutation),
      };
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
        emitter.sendMutation({
          target: { type: "message", id: turn.assistantMessage.localId },
          op: "upsert",
          path: "",
          value: toResponseMessagePayload({
            messageId: turn.assistantMessage.localId,
            parentId: turn.userMessage.localId,
            thinkingEnabled: body.thinking_enabled,
            searchEnabled: body.search_enabled,
            insertedAt: turn.assistantMessage.insertedAt,
            blocks: [],
            hasPendingBlock: false,
          }),
        });
      };

      const ensureResponseInitialized = () => {
        if (responseInitialized) return;
        sendInitialResponse();
      };

      const createResponseBlock = async (localId: number) => {
        if (responseBlockDbIdByLocalId.has(localId)) return;

        const block = await prisma.messageBlock.create({
          data: {
            localId,
            messageId: turn.assistantMessage.id,
            type: "response",
            content: "",
            referencesJson: [] as Prisma.InputJsonArray,
            stageId: null,
          },
        });

        createdBlockIds.add(localId);
        responseBlockDbIdByLocalId.set(localId, block.id);
        responseContentByLocalId.set(localId, "");
        lastPersistedContentByLocalId.set(localId, "");
        lastPersistedAtByLocalId.set(localId, Date.now());
      };

      const ensureEmptyResponseBlock = async () => {
        if (createdBlockIds.size > 0) return;

        const localId = 1;
        await createResponseBlock(localId);
        emitter.sendMutation({
          target: { type: "message", id: turn.assistantMessage.localId },
          op: "append",
          path: "blocks",
          value: {
            id: localId,
            type: "response",
            content: "",
            references: [],
          },
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
        localId: number,
        toolName: string,
        toolCallId: string,
        input: unknown,
      ) => {
        await prisma.messageBlock.create({
          data: {
            localId,
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
        createdBlockIds.add(localId);
      };

      const updateToolCallBlock = async (
        localId: number,
        status: "FINISHED" | "FAILED",
        output: unknown,
      ) => {
        await prisma.messageBlock.update({
          where: {
            messageId_localId: {
              messageId: turn.assistantMessage.id,
              localId,
            },
          },
          data: {
            status,
            toolOutputJson: toInputJson(output),
          },
        });
      };

      emitter.sendLifecycle("ready", {
        response_message_id: turn.assistantMessage.localId,
        user_message_id: turn.userMessage.localId,
      });

      emitter.sendMutation({
        target: { type: "session", id: body.chat_session_id },
        op: "set",
        path: "updated_at",
        value: toEpochSeconds(turn.updatedSession.updatedAt),
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
          prompt: body.prompt,
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
          ensureResponseInitialized,
          onResponseBlock: createResponseBlock,
          onToolCall: createToolCallBlock,
          onToolResult: (localId, _toolCallId, output) =>
            updateToolCallBlock(localId, "FINISHED", output),
          onToolError: (localId, _toolCallId, error) =>
            updateToolCallBlock(localId, "FAILED", error),
          onContentAppend: async (localId, contentDelta) => {
            responseContentByLocalId.set(
              localId,
              `${responseContentByLocalId.get(localId) ?? ""}${contentDelta}`,
            );
            await persistContent(localId);
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
          emitter.sendLifecycle("done", { status: "aborted" });
          return;
        }

        emitter.sendMutation({
          target: { type: "message", id: turn.assistantMessage.localId },
          op: "set",
          path: "accumulated_token_usage",
          value: tokenUsage,
        });

        emitter.sendMutation({
          target: { type: "message", id: turn.assistantMessage.localId },
          op: "set",
          path: "status",
          value: finished.assistantMessage.status,
        });

        emitter.sendMutation({
          target: { type: "session", id: body.chat_session_id },
          op: "set",
          path: "updated_at",
          value: toEpochSeconds(finished.session.updatedAt),
        });

        emitter.sendMutation({
          target: { type: "session", id: body.chat_session_id },
          op: "set",
          path: "title",
          value: finished.session.title ?? "新会话",
        });

        emitter.sendLifecycle("done", { status: "finished" });
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
          emitter.sendMutation({
            target: { type: "message", id: turn.assistantMessage.localId },
            op: "set",
            path: "status",
            value: "FAILED",
          });
        }

        emitter.sendLifecycle("error", {
          message: errorMessage,
        });

        emitter.sendLifecycle("done", { status: "failed" });
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
        message: error instanceof Error ? error.message : "Invalid request body",
      },
      400,
    );
  }

  const activeRun = activeCompletionControllers.get(body.chat_session_id);

  if (
    activeRun &&
    activeRun.assistantMessageLocalId === body.message_id
  ) {
    let unsubscribe: (() => void) | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const emitter = createMutationEmitter(controller);

        emitter.sendLifecycle("ready", {
          response_message_id: activeRun.assistantMessageLocalId,
          user_message_id: activeRun.userMessageLocalId,
        });

        if (activeRun.snapshot) {
          emitter.sendMutation({
            target: {
              type: "message",
              id: activeRun.assistantMessageLocalId,
            },
            op: "upsert",
            path: "",
            value: cloneRecord(activeRun.snapshot),
          });
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

  const message = await prisma.chatMessage.findFirst({
    where: {
      chatSessionId: body.chat_session_id,
      localId: body.message_id,
      role: "ASSISTANT",
    },
    select: {
      status: true,
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
    return createLifecycleSseResponse("done", { status: "finished" });
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
  }

  return createLifecycleSseResponse("error", {
    message: "生成已中断",
  });
}
