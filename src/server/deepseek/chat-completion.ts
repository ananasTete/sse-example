import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SSE_HEADERS,
  createSseResponse,
  sendSseEvent,
  sendSseFrame,
} from "@/src/server/http/sse";

// 最新配置，不要改这里
const DEFAULT_DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

function parseCompletionRequestBody(body: unknown): CompletionRequestBody {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const chatSessionId = body.chat_session_id;
  const prompt = body.prompt;

  if (typeof chatSessionId !== "string" || !chatSessionId.trim()) {
    throw new Error("chat_session_id is required");
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt is required");
  }

  return {
    chat_session_id: chatSessionId.trim(),
    parent_message_id:
      typeof body.parent_message_id === "number"
        ? body.parent_message_id
        : null,
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
    fragments: [],
    conversation_mode: input.searchEnabled ? "SEARCH" : "DEFAULT",
    has_pending_fragment: true,
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
    const session = await tx.chatSession.findUnique({
      where: { id: body.chat_session_id },
      select: { id: true },
    });

    if (!session) {
      throw new Error("Chat session not found");
    }

    const userMessage = await tx.chatMessage.create({
      data: {
        chatSessionId: body.chat_session_id,
        parentId: body.parent_message_id,
        role: "USER",
        status: "FINISHED",
        accumulatedTokenUsage: body.prompt.length,
        searchEnabled: body.search_enabled,
        fragments: {
          create: {
            type: "REQUEST",
            content: body.prompt,
          },
        },
      },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        chatSessionId: body.chat_session_id,
        parentId: userMessage.id,
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
        currentMessageId: assistantMessage.id,
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

export async function chatCompletionHandler(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return createCompletionErrorSseResponse(
      "Missing DEEPSEEK_API_KEY environment variable",
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
    return createCompletionErrorSseResponse(
      error instanceof Error ? error.message : "Failed to create completion",
      404,
    );
  }

  const deepseek = createOpenAI({
    name: "deepseek",
    apiKey,
    baseURL: process.env.DEEPSEEK_API_BASE_URL ?? DEFAULT_DEEPSEEK_API_BASE_URL,
  });

  const result = streamText({
    model: deepseek.chat(process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL),
    prompt: body.prompt,
    abortSignal: request.signal,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fragmentId: number | null = null;
      let content = "";
      let lastPersistedContent = "";
      let lastPersistedAt = 0;
      let tokenUsage = 0;

      const sendData = (data: object | string) => {
        sendSseEvent(controller, encoder, data);
      };

      const persistContent = async (force = false) => {
        if (fragmentId === null || content === lastPersistedContent) return;

        const now = Date.now();
        if (!force && now - lastPersistedAt < 500) return;

        await prisma.messageFragment.update({
          where: { id: fragmentId },
          data: {
            content,
          },
        });
        lastPersistedContent = content;
        lastPersistedAt = now;
      };

      sendSseFrame(controller, encoder, {
        event: "ready",
        data: {
          request_message_id: turn.userMessage.id,
          response_message_id: turn.assistantMessage.id,
          model_type: body.model_type,
        },
      });

      sendSseFrame(controller, encoder, {
        event: "update_session",
        data: {
          updated_at: toEpochSeconds(turn.updatedSession.updatedAt),
        },
      });

      sendData({
        v: {
          response: toResponseMessagePayload({
            messageId: turn.assistantMessage.id,
            parentId: turn.userMessage.id,
            thinkingEnabled: body.thinking_enabled,
            searchEnabled: body.search_enabled,
            insertedAt: turn.assistantMessage.insertedAt,
          }),
        },
      });

      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            content += part.text;

            if (fragmentId === null) {
              const fragment = await prisma.messageFragment.create({
                data: {
                  messageId: turn.assistantMessage.id,
                  type: "RESPONSE",
                  content: part.text,
                  referencesJson: [] as Prisma.InputJsonArray,
                },
              });
              fragmentId = fragment.id;
              lastPersistedContent = part.text;
              lastPersistedAt = Date.now();

              sendData({
                p: "response",
                o: "BATCH",
                v: [
                  {
                    p: "fragments",
                    o: "APPEND",
                    v: [
                      {
                        id: fragment.id,
                        type: "RESPONSE",
                        content: part.text,
                        references: [],
                        stage_id: null,
                      },
                    ],
                  },
                  {
                    p: "has_pending_fragment",
                    o: "SET",
                    v: false,
                  },
                ],
              });
              continue;
            }

            await persistContent();

            sendData({
              p: "response/fragments/-1/content",
              o: "APPEND",
              v: part.text,
            });
          }

          if (part.type === "finish") {
            tokenUsage = part.totalUsage.totalTokens ?? 0;
          }
        }

        if (fragmentId === null) {
          const fragment = await prisma.messageFragment.create({
            data: {
              messageId: turn.assistantMessage.id,
              type: "RESPONSE",
              content: "",
              referencesJson: [] as Prisma.InputJsonArray,
            },
          });
          fragmentId = fragment.id;
          lastPersistedContent = "";
          lastPersistedAt = Date.now();
          sendData({
            p: "response",
            o: "BATCH",
            v: [
              {
                p: "fragments",
                o: "APPEND",
                v: [
                  {
                    id: fragment.id,
                    type: "RESPONSE",
                    content: "",
                    references: [],
                    stage_id: null,
                  },
                ],
              },
              {
                p: "has_pending_fragment",
                o: "SET",
                v: false,
              },
            ],
          });
        }

        await persistContent(true);

        const finished = await prisma.$transaction(async (tx) => {
          const assistantMessage = await tx.chatMessage.update({
            where: { id: turn.assistantMessage.id },
            data: {
              status: "FINISHED",
              accumulatedTokenUsage: tokenUsage,
              hasPendingFragment: false,
            },
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

        sendData({
          p: "response",
          o: "BATCH",
          v: [
            {
              p: "accumulated_token_usage",
              v: tokenUsage,
            },
            {
              p: "quasi_status",
              v: "FINISHED",
            },
          ],
        });

        sendData({
          p: "response/status",
          o: "SET",
          v: finished.assistantMessage.status,
        });

        sendSseFrame(controller, encoder, {
          event: "update_session",
          data: {
            updated_at: toEpochSeconds(finished.session.updatedAt),
          },
        });

        sendSseFrame(controller, encoder, {
          event: "title",
          data: {
            content: finished.session.title ?? "新会话",
          },
        });

        sendSseFrame(controller, encoder, {
          event: "close",
          data: {
            click_behavior: "none",
            auto_resume: false,
          },
        });
      } catch (error) {
        await prisma.chatMessage.update({
          where: { id: turn.assistantMessage.id },
          data: {
            status: "FAILED",
            incompleteMessage:
              error instanceof Error ? error.message : "Completion failed",
            hasPendingFragment: false,
          },
        });

        sendData({
          p: "response/status",
          o: "SET",
          v: "FAILED",
        });

        sendSseFrame(controller, encoder, {
          event: "error",
          data: {
            message:
              error instanceof Error ? error.message : "Completion failed",
          },
        });

        sendSseFrame(controller, encoder, {
          event: "close",
          data: {
            click_behavior: "none",
            auto_resume: false,
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return createSseResponse(stream);
}
