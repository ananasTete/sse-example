import { createFileRoute } from "@tanstack/react-router";
import {
  streamBus,
  activeStreams,
  activeStreamParts,
  acquireStreamStartLock,
  releaseStreamStartLock,
  initActiveStream,
  markStreamProducerStarted,
  isActiveStream,
  emitStreamEvent,
  finishActiveStream,
  getStreamEventsAfter,
  type SequencedStreamEvent,
} from "@/src/server/stream-manager";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { jsonError } from "@/src/server/http/json";
import type { MessagePart } from "@/src/types/chat-advanced";
import { createSseResponse } from "@/src/server/http/sse";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function hasDuplicateTurnMessageIds(input: {
  assistantMsgId: string;
  humanMsgId?: string;
}) {
  const { assistantMsgId, humanMsgId } = input;
  const ids = humanMsgId ? [assistantMsgId, humanMsgId] : [assistantMsgId];
  const existing = await prisma.message.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return existing.length > 0;
}

async function validateCompletionContext(input: {
  chatId: string;
  parentId: string;
}) {
  const { chatId, parentId } = input;
  const rootId = `chat-root-${chatId}`;

  const chat = await prisma.chat.findFirst({
    where: { id: chatId, deletedAt: null },
    select: { id: true },
  });
  if (!chat) {
    return { ok: false as const, status: 404, message: "Chat not found" };
  }

  if (parentId === rootId) {
    return { ok: true as const };
  }

  const parentMessage = await prisma.message.findUnique({
    where: { id: parentId },
    select: { chatId: true },
  });

  if (!parentMessage || parentMessage.chatId !== chatId) {
    return {
      ok: false as const,
      status: 400,
      message: "Invalid parent message id",
    };
  }

  return { ok: true as const };
}

function createReplayOrLiveSseResponse(input: {
  leafId: string;
  afterSeq: number;
  request: Request;
}) {
  const { leafId, afterSeq, request } = input;
  const streamState = activeStreams.get(leafId);
  if (!streamState) return null;

  const hasReplayEvents = getStreamEventsAfter(leafId, afterSeq).length > 0;
  if (!hasReplayEvents && !streamState.producerStarted) return null;
  if (!streamState.active && !hasReplayEvents) return null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let cleanup = () => {};

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore close errors
        }
      };

      const push = (data: SequencedStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
          cleanup();
        }
      };

      cleanup = () => {
        streamBus.off(`stream:${leafId}`, onEvent);
        request.signal.removeEventListener("abort", onAbort);
      };

      const onEvent = (data: SequencedStreamEvent) => {
        push(data);
        if (data.type === "message_stop") {
          cleanup();
          close();
        }
      };

      const onAbort = () => {
        cleanup();
        close();
      };

      const replayEvents = getStreamEventsAfter(leafId, afterSeq);
      for (const replayEvent of replayEvents) {
        push(replayEvent);
        if (replayEvent.type === "message_stop") {
          cleanup();
          close();
          return;
        }
      }

      const latestState = activeStreams.get(leafId);
      if (!latestState?.active) {
        cleanup();
        close();
        return;
      }

      streamBus.on(`stream:${leafId}`, onEvent);
      request.signal.addEventListener("abort", onAbort);
    },
  });

  return createSseResponse(stream);
}

async function createTurnMessagesAtomically(input: {
  chatId: string;
  msgId: string;
  prompt?: string;
  parentId: string;
  humanMsgId?: string;
}) {
  const { chatId, msgId, prompt, parentId, humanMsgId } = input;
  const reserveCount = humanMsgId && prompt ? 2 : 1;

  await prisma.$transaction(async (tx) => {
    const chat = await tx.chat.update({
      where: { id: chatId },
      data: {
        nextSeq: { increment: reserveCount },
        cursorMessageId: msgId,
      },
      select: { nextSeq: true },
    });

    const baseSeq = chat.nextSeq - reserveCount;
    const userSeq = baseSeq + 1;
    const assistantSeq = baseSeq + reserveCount;

    if (humanMsgId && prompt) {
      await tx.message.create({
        data: {
          id: humanMsgId,
          chatId,
          parentId,
          role: "user",
          partsJson: [
            { type: "text", text: prompt, state: "done" },
          ] as Prisma.InputJsonArray,
          status: "completed",
          seq: userSeq,
        },
      });
    }

    await tx.message.create({
      data: {
        id: msgId,
        chatId,
        parentId: humanMsgId || parentId,
        role: "assistant",
        partsJson: [] as Prisma.InputJsonArray,
        status: "in_progress",
        seq: assistantSeq,
      },
    });
  });
}

export const Route = createFileRoute("/api/advanced-chat/$chatId/completion")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let body: Record<string, unknown>;
        try {
          const parsed = await request.json();
          if (!parsed || typeof parsed !== "object") {
            return jsonError("Invalid request body", 400);
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return jsonError("Invalid request body", 400);
        }

        const turnMessageUuids = body.turn_message_uuids as
          | { assistant?: string; human?: string }
          | undefined;
        const prompt =
          typeof body.prompt === "string" ? body.prompt : undefined;
        const parentId =
          typeof body.parentId === "string" ? body.parentId : undefined;
        const assistantMsgId = turnMessageUuids?.assistant;
        const humanMsgId = turnMessageUuids?.human;

        if (!assistantMsgId) {
          return jsonError("Missing assistant message uuid", 400);
        }
        if (!parentId) {
          return jsonError("Missing parent message id", 400);
        }

        let contextValidation:
          | { ok: true }
          | { ok: false; status: number; message: string };
        try {
          contextValidation = await validateCompletionContext({
            chatId: params.chatId,
            parentId,
          });
        } catch (error) {
          console.error("Failed to validate completion context", error);
          return jsonError("Failed to validate completion context", 500);
        }

        if (!contextValidation.ok) {
          return jsonError(contextValidation.message, contextValidation.status);
        }

        // Idempotency: duplicate completion requests for the same assistant message
        // should replay/attach to the existing stream instead of failing.
        const inFlightReplayResponse = createReplayOrLiveSseResponse({
          leafId: assistantMsgId,
          afterSeq: 0,
          request,
        });
        if (inFlightReplayResponse) {
          return inFlightReplayResponse;
        }

        if (!acquireStreamStartLock(assistantMsgId)) {
          const pendingReplayResponse = createReplayOrLiveSseResponse({
            leafId: assistantMsgId,
            afterSeq: 0,
            request,
          });
          if (pendingReplayResponse) {
            return pendingReplayResponse;
          }
          return jsonError("Stream start already in progress", 409);
        }

        initActiveStream(assistantMsgId);
        let taskStarted = false;
        let startLockReleased = false;

        const releaseStartLockOnce = () => {
          if (startLockReleased) return;
          startLockReleased = true;
          releaseStreamStartLock(assistantMsgId);
        };

        const cleanupPreStartState = () => {
          if (taskStarted) return;
          activeStreams.delete(assistantMsgId);
          activeStreamParts.delete(assistantMsgId);
          releaseStartLockOnce();
        };

        let hasDuplicateIds = false;
        try {
          hasDuplicateIds = await hasDuplicateTurnMessageIds({
            assistantMsgId,
            humanMsgId,
          });
        } catch (error) {
          cleanupPreStartState();
          console.error("Failed to check duplicate turn ids", error);
          return jsonError("Failed to validate turn message ids", 500);
        }
        if (hasDuplicateIds) {
          cleanupPreStartState();
          return jsonError("Duplicate turn_message_uuids", 409);
        }

        const startTask = () => {
          if (taskStarted) return;
          taskStarted = true;
          markStreamProducerStarted(assistantMsgId);
          emitStreamEvent(assistantMsgId, {
            type: "message_delta",
            delta: {},
          });
          releaseStartLockOnce();
          runLLMTaskInBackground(
            params.chatId,
            assistantMsgId,
            prompt,
            parentId,
            humanMsgId,
          ).catch((error) => {
            console.error("runLLMTaskInBackground crashed", error);
          });
        };

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let closed = false;
            let cleanup = () => {};

            const close = () => {
              if (closed) return;
              closed = true;
              try {
                controller.close();
              } catch {
                // ignore close errors
              }
            };

            const push = (data: SequencedStreamEvent) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                closed = true;
                cleanup();
              }
            };

            cleanup = () => {
              streamBus.off(`stream:${assistantMsgId}`, onEvent);
              request.signal.removeEventListener("abort", onAbort);
            };

            const onEvent = (data: SequencedStreamEvent) => {
              push(data);
              if (data.type === "message_stop") {
                cleanup();
                close();
              }
            };

            const onAbort = () => {
              cleanup();
              cleanupPreStartState();
              close();
            };

            const replayEvents = getStreamEventsAfter(assistantMsgId, 0);
            for (const replayEvent of replayEvents) {
              push(replayEvent);
              if (replayEvent.type === "message_stop") {
                cleanup();
                close();
                return;
              }
            }

            streamBus.on(`stream:${assistantMsgId}`, onEvent);
            request.signal.addEventListener("abort", onAbort);

            if (request.signal.aborted) {
              cleanup();
              cleanupPreStartState();
              close();
              return;
            }

            startTask();
          },
        });

        return createSseResponse(stream);
      },
    },
  },
});

async function runLLMTaskInBackground(
  chatId: string,
  msgId: string,
  prompt: string | undefined,
  parentId: string,
  humanMsgId?: string,
) {
  const parts: MessagePart[] = [];
  let assistantMessagePersisted = false;
  let finalized = false;
  let messageStopSent = false;

  const emitMessageStop = () => {
    if (messageStopSent) return;
    emitStreamEvent(msgId, { type: "message_stop" });
    messageStopSent = true;
  };

  const persistAssistantStatus = async (
    status: "completed" | "aborted" | "error",
  ) => {
    if (!assistantMessagePersisted) return;
    const data: Prisma.MessageUpdateInput = { status };
    if (parts.length > 0) {
      data.partsJson = parts as Prisma.InputJsonArray;
    }
    await prisma.message.update({
      where: { id: msgId },
      data,
    });
  };

  const finalize = async (
    status: "completed" | "aborted" | "error",
    errorMessage?: string,
  ) => {
    if (finalized) return;
    finalized = true;

    if (status === "aborted") {
      emitStreamEvent(msgId, {
        type: "message_delta",
        delta: { stop_reason: "user_abort" },
      });
    }

    if (status === "error") {
      emitStreamEvent(msgId, {
        type: "error",
        error: {
          type: "stream_error",
          message: errorMessage ?? "Stream failed unexpectedly",
        },
      });
      emitStreamEvent(msgId, {
        type: "message_delta",
        delta: { stop_reason: "error" },
      });
    }

    emitMessageStop();

    try {
      await persistAssistantStatus(status);
    } catch (persistError) {
      console.error("Failed to persist assistant status", persistError);
    }
  };

  const ensureActiveOrAbort = async () => {
    if (isActiveStream(msgId)) return true;
    await finalize("aborted");
    return false;
  };

  try {
    await createTurnMessagesAtomically({
      chatId,
      msgId,
      prompt,
      parentId,
      humanMsgId,
    });
    assistantMessagePersisted = true;

    activeStreamParts.set(msgId, parts);

    if (!(await ensureActiveOrAbort())) return;

    emitStreamEvent(msgId, {
      type: "message_start",
      message: { id: msgId, role: "assistant", model: "openai/gpt-5-nano" },
    });

    emitStreamEvent(msgId, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "reasoning" },
    });
    let reasoningText = "Let me think deeply about this.\n";
    reasoningText += `You asked: ${prompt || "unknown"}\n`;
    reasoningText += "Looks like I need to use the weather tool.\n";

    parts.push({ type: "reasoning", text: "", state: "done" });
    for (const char of reasoningText) {
      if (!(await ensureActiveOrAbort())) return;
      (parts[0] as { type: "reasoning"; text: string }).text += char;
      emitStreamEvent(msgId, {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: char },
      });
      await sleep(20);
    }
    emitStreamEvent(msgId, { type: "content_block_stop", index: 0 });

    if (!(await ensureActiveOrAbort())) return;

    emitStreamEvent(msgId, {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "call_abc123", name: "weather" },
    });

    const mockToolInput = '{"location": "Tokyo", "unit": "celsius"}';
    parts.push({
      type: "tool_use",
      tool_name: "weather",
      tool_use_id: "call_abc123",
      input_json: mockToolInput,
      state: "done",
    });

    for (const char of mockToolInput) {
      if (!(await ensureActiveOrAbort())) return;
      emitStreamEvent(msgId, {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: char },
      });
      await sleep(30);
    }
    emitStreamEvent(msgId, { type: "content_block_stop", index: 1 });

    if (!(await ensureActiveOrAbort())) return;

    const weatherMockResult = {
      location: "Tokyo, Japan",
      temperature: 22,
      temperatureHigh: 25,
      temperatureLow: 18,
      condition: { text: "Sunny", icon: "☀️" },
      humidity: 45,
      windSpeed: 12,
      dailyForecast: [
        {
          day: "Today",
          high: 25,
          low: 18,
          condition: { text: "Sunny", icon: "☀️" },
        },
        {
          day: "Tomorrow",
          high: 23,
          low: 17,
          condition: { text: "Cloudy", icon: "☁️" },
        },
      ],
    };

    emitStreamEvent(msgId, {
      type: "content_block_start",
      index: 2,
      content_block: {
        type: "tool_result",
        id: "call_abc123",
        content: [weatherMockResult],
      },
    });

    parts.push({
      type: "tool_result",
      tool_use_id: "call_abc123",
      content: [weatherMockResult],
      state: "done",
    });

    emitStreamEvent(msgId, { type: "content_block_stop", index: 2 });

    if (!(await ensureActiveOrAbort())) return;

    emitStreamEvent(msgId, {
      type: "content_block_start",
      index: 3,
      content_block: { type: "text" },
    });
    const textPart =
      "Based on the weather tool result, it is currently sunny in Tokyo with a temperature of 22°C. Have a great day!";

    parts.push({ type: "text", text: "", state: "done" });
    for (const char of textPart) {
      if (!(await ensureActiveOrAbort())) return;
      (parts[3] as { type: "text"; text: string }).text += char;
      emitStreamEvent(msgId, {
        type: "content_block_delta",
        index: 3,
        delta: { type: "text_delta", text: char },
      });
      await sleep(20);
    }
    emitStreamEvent(msgId, { type: "content_block_stop", index: 3 });

    emitStreamEvent(msgId, {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
    });

    emitStreamEvent(msgId, {
      type: "message_limit",
      message_limit: { type: "within_limit", remaining: 49, utilization: 0.02 },
    });

    await finalize("completed");
  } catch (err) {
    console.error("runLLMTaskInBackground error:", err);
    if (isActiveStream(msgId)) {
      await finalize(
        "error",
        err instanceof Error ? err.message : "Unknown stream error",
      );
    } else {
      await finalize("aborted");
    }
  } finally {
    finishActiveStream(msgId);
    activeStreamParts.delete(msgId);
  }
}
