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
  createPatchEmitter,
  createWebSearchTool,
} from "@/lib/chat-core";
import type { WebSearchFn } from "@/lib/chat-core";

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
  "引用来源时使用 <citation cite_index=\"N\">N</citation>，N 对应搜索结果编号。",
  "搜索结果无法支持的内容，直接说明当前搜索结果未提供。",
].join("\n");

interface CompletionRequestBody {
  chat_session_id: string;
  parent_message_id: number | null;
  model_type: string;
  prompt: string;
  ref_file_ids: string[];
  thinking_enabled: boolean;
  search_enabled: boolean;
  preempt: boolean;
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
  {
    assistantMessageId: number;
    controller: AbortController;
  }
>();

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
    model_type:
      typeof body.model_type === "string" && body.model_type.trim()
        ? body.model_type.trim()
        : "default",
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

function toResponseMessagePayload(input: {
  messageId: number;
  parentId: number;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  insertedAt: Date;
  fragments?: unknown[];
  hasPendingFragment?: boolean;
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
    fragments: input.fragments ?? [],
    conversation_mode: input.searchEnabled ? "SEARCH" : "DEFAULT",
    has_pending_fragment: input.hasPendingFragment ?? false,
    auto_continue: false,
  };
}

function createCompletionErrorSseResponse(message: string, status: number) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      sendSseFrame(controller, encoder, {
        event: "error",
        data: {
          message,
        },
      });
      sendSseFrame(controller, encoder, {
        event: "close",
        data: {
          click_behavior: "none",
          auto_resume: false,
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
        throw new CompletionHttpError("A completion is already in progress", 409);
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
          hasPendingFragment: false,
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
        fragments: {
          create: {
            localId: 1,
            type: "REQUEST",
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
        hasPendingFragment: true,
      },
    });

    const updatedSession = await tx.chatSession.update({
      where: { id: body.chat_session_id },
      data: {
        currentMessageId: assistantMessage.localId,
        isEmpty: false,
        modelType: body.model_type,
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

    return createCompletionErrorSseResponse(
      message,
      status,
    );
  }

  if (body.preempt) {
    activeCompletionControllers.get(body.chat_session_id)?.controller.abort();
  }

  const completionController = new AbortController();
  activeCompletionControllers.set(body.chat_session_id, {
    assistantMessageId: turn.assistantMessage.id,
    controller: completionController,
  });

  request.signal.addEventListener(
    "abort",
    () => {
      completionController.abort();
    },
    { once: true },
  );

  const modelProvider = createDeepSeek({
    apiKey,
    baseURL: process.env[MODEL_API_BASE_URL_ENV] ?? DEFAULT_MODEL_API_BASE_URL,
  });

  const streamTextFn = options.streamText ?? streamText;
  const webSearch = options.webSearch;

  const stream = new ReadableStream({
    async start(controller) {
      const emitter = createPatchEmitter(controller);
      const createdFragmentIds = new Set<number>();
      const responseFragmentDbIdByLocalId = new Map<number, number>();
      const responseContentByLocalId = new Map<number, string>();
      const lastPersistedContentByLocalId = new Map<number, string>();
      const lastPersistedAtByLocalId = new Map<number, number>();
      let tokenUsage = 0;
      let responseInitialized = false;

      const toInputJson = (value: unknown) =>
        value === undefined
          ? Prisma.JsonNull
          : (value as Prisma.InputJsonValue);

      const sendEventFrame = (frame: {
        event: string;
        data: object | string;
      }) => {
        emitter.sendEventFrame(frame);
      };

      const sendInitialResponse = () => {
        responseInitialized = true;
        emitter.sendFullData({
          v: {
            response: toResponseMessagePayload({
              messageId: turn.assistantMessage.localId,
              parentId: turn.userMessage.localId,
              thinkingEnabled: body.thinking_enabled,
              searchEnabled: body.search_enabled,
              insertedAt: turn.assistantMessage.insertedAt,
              fragments: [],
              hasPendingFragment: false,
            }),
          },
        });
      };

      const ensureResponseInitialized = () => {
        if (responseInitialized) return;
        sendInitialResponse();
      };

      const createResponseFragment = async (localId: number) => {
        if (responseFragmentDbIdByLocalId.has(localId)) return;

        const fragment = await prisma.messageFragment.create({
          data: {
            localId,
            messageId: turn.assistantMessage.id,
            type: "RESPONSE",
            content: "",
            referencesJson: [] as Prisma.InputJsonArray,
            stageId: null,
          },
        });

        createdFragmentIds.add(localId);
        responseFragmentDbIdByLocalId.set(localId, fragment.id);
        responseContentByLocalId.set(localId, "");
        lastPersistedContentByLocalId.set(localId, "");
        lastPersistedAtByLocalId.set(localId, Date.now());
      };

      const ensureEmptyResponseFragment = async () => {
        if (createdFragmentIds.size > 0) return;

        const localId = 1;
        await createResponseFragment(localId);
        emitter.sendPatch({
          t: { type: "response" },
          p: "fragments",
          o: "APPEND",
          v: {
            id: localId,
            type: "RESPONSE",
            content: "",
            references: [],
          },
        });
      };

      const persistContent = async (localId: number, force = false) => {
        const fragmentDbId = responseFragmentDbIdByLocalId.get(localId);
        if (fragmentDbId === undefined) return;

        const content = responseContentByLocalId.get(localId) ?? "";
        if (content === lastPersistedContentByLocalId.get(localId)) return;
        const now = Date.now();
        const lastPersistedAt = lastPersistedAtByLocalId.get(localId) ?? 0;
        if (!force && now - lastPersistedAt < 500) return;

        await prisma.messageFragment.update({
          where: { id: fragmentDbId },
          data: {
            content,
          },
        });
        lastPersistedContentByLocalId.set(localId, content);
        lastPersistedAtByLocalId.set(localId, now);
      };

      const persistAllContent = async (force = false) => {
        for (const localId of responseFragmentDbIdByLocalId.keys()) {
          await persistContent(localId, force);
        }
      };

      const createToolCallFragment = async (
        localId: number,
        toolName: string,
        toolCallId: string,
        input: unknown,
      ) => {
        await prisma.messageFragment.create({
          data: {
            localId,
            messageId: turn.assistantMessage.id,
            type: "TOOL_CALL",
            status: "WIP",
            content: null,
            toolName,
            toolCallId,
            toolInputJson: toInputJson(input),
            toolOutputJson: Prisma.JsonNull,
          },
        });
        createdFragmentIds.add(localId);
      };

      const updateToolCallFragment = async (
        localId: number,
        status: "FINISHED" | "FAILED",
        output: unknown,
      ) => {
        await prisma.messageFragment.update({
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

      sendEventFrame({
        event: "ready",
        data: {
          request_message_id: turn.userMessage.localId,
          response_message_id: turn.assistantMessage.localId,
          model_type: body.model_type,
        },
      });

      sendEventFrame({
        event: "update_session",
        data: {
          updated_at: toEpochSeconds(turn.updatedSession.updatedAt),
        },
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
          ensureResponseInitialized,
          onResponseFragment: createResponseFragment,
          onToolCall: createToolCallFragment,
          onToolResult: (localId, _toolCallId, output) =>
            updateToolCallFragment(localId, "FINISHED", output),
          onToolError: (localId, _toolCallId, error) =>
            updateToolCallFragment(localId, "FAILED", error),
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
              hasPendingFragment: false,
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
          sendEventFrame({
            event: "close",
            data: {
              click_behavior: "none",
              auto_resume: false,
            },
          });
          return;
        }

        emitter.sendPatch({
          t: { type: "response" },
          p: "accumulated_token_usage",
          o: "SET",
          v: tokenUsage,
        });

        emitter.sendPatch({
          t: { type: "response" },
          p: "status",
          o: "SET",
          v: finished.assistantMessage.status,
        });

        sendEventFrame({
          event: "update_session",
          data: {
            updated_at: toEpochSeconds(finished.session.updatedAt),
          },
        });

        sendEventFrame({
          event: "title",
          data: {
            content: finished.session.title ?? "新会话",
          },
        });

        sendEventFrame({
          event: "close",
          data: {
            click_behavior: "none",
            auto_resume: false,
          },
        });
      } catch (error) {
        if (!responseInitialized) {
          ensureResponseInitialized();
        }
        await ensureEmptyResponseFragment();

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
            hasPendingFragment: false,
          },
        });

        if (responseInitialized) {
          emitter.sendPatch({
            t: { type: "response" },
            p: "status",
            o: "SET",
            v: "FAILED",
          });
        }

        sendEventFrame({
          event: "error",
          data: {
            message: errorMessage,
          },
        });

        sendEventFrame({
          event: "close",
          data: {
            click_behavior: "none",
            auto_resume: false,
          },
        });
      } finally {
        const activeController = activeCompletionControllers.get(
          body.chat_session_id,
        );
        if (
          activeController?.assistantMessageId === turn.assistantMessage.id
        ) {
          activeCompletionControllers.delete(body.chat_session_id);
        }
        controller.close();
      }
    },
  });

  return createSseResponse(stream);
}
