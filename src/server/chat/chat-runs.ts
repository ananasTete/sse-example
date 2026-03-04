import { chatStore } from "@/lib/chat-store";
import type { ChatRunEntity, ChatRunEventEntity } from "@/lib/chat-store";
import type { MessagePartV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { jsonError } from "@/src/server/http/json";
import { createSseResponse, sendSseEvent, sendSseFrame } from "@/src/server/http/sse";
import { parseStreamChatRequest, toChatMessageV2 } from "./contracts";
import { resolveRequestUserId } from "./chat-service";

const DEFAULT_MODEL = "openai/gpt-5-nano";
const POLL_INTERVAL_MS = 180;
const RUN_STALL_TIMEOUT_MS = 5_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const generateId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}`;

const getConversationRootId = (chatId: string) => `chat-root:${chatId}`;

const normalizePartsForStorage = (parts: MessagePartV2[]): MessagePartV2[] =>
  parts.map((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return {
        ...part,
        state: "done" as const,
      };
    }
    return part;
  });

const mockWeatherData = {
  location: "Bordeaux",
  temperature: 22,
  temperatureHigh: 26,
  temperatureLow: 16,
  condition: {
    text: "Foggy",
    icon: "cloud-fog",
  },
  humidity: 51,
  windSpeed: 9,
  dailyForecast: [
    {
      day: "Today",
      high: 21,
      low: 12,
      condition: { text: "Partly Cloudy", icon: "cloud-sun" },
    },
    {
      day: "Tomorrow",
      high: 25,
      low: 13,
      condition: { text: "Cloudy", icon: "cloud" },
    },
    {
      day: "Thu",
      high: 26,
      low: 18,
      condition: { text: "Rainy", icon: "cloud-rain" },
    },
    {
      day: "Fri",
      high: 25,
      low: 12,
      condition: { text: "Foggy", icon: "cloud-fog" },
    },
    {
      day: "Sat",
      high: 26,
      low: 19,
      condition: { text: "Sunny", icon: "sun" },
    },
  ],
};

const isWeatherQuery = (text: string) => {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("天气") ||
    lowerText.includes("weather") ||
    lowerText.includes("气温") ||
    lowerText.includes("温度")
  );
};

const extractCity = (text: string) => {
  const cities = [
    "Bordeaux",
    "Paris",
    "北京",
    "上海",
    "广州",
    "深圳",
    "杭州",
    "New York",
    "London",
    "Tokyo",
  ];
  for (const city of cities) {
    if (text.toLowerCase().includes(city.toLowerCase())) {
      return city;
    }
  }
  return "Bordeaux";
};

class StreamAbortedError extends Error {
  constructor() {
    super("Run aborted");
    this.name = "StreamAbortedError";
  }
}

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) {
    throw new StreamAbortedError();
  }
};

const delay = async (ms: number, signal: AbortSignal) => {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new StreamAbortedError());
    };

    signal.addEventListener("abort", onAbort);
  });

  throwIfAborted(signal);
};

interface RunExecutionInput {
  runId: string;
  chatId: string;
  userId: string;
  model: string;
  userText: string;
  assistantMessageId: string;
}

const runAbortControllers = new Map<string, AbortController>();
const stalledRunRecoveryTasks = new Map<string, Promise<void>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const findLastPartIndex = (
  parts: MessagePartV2[],
  predicate: (part: MessagePartV2) => boolean,
): number => {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (predicate(parts[i])) return i;
  }
  return -1;
};

const normalizeDeltaPayload = (payload: unknown): Record<string, unknown> | null => {
  if (!isRecord(payload)) return null;
  const value = payload.v;
  if (isRecord(value) && typeof value.type === "string") {
    return value;
  }
  return null;
};

const rebuildAssistantPartsFromEvents = (
  events: ChatRunEventEntity[],
): MessagePartV2[] => {
  const parts: MessagePartV2[] = [];
  let currentReasoningText = "";
  let currentTextContent = "";

  for (const event of events) {
    if (event.event !== "delta") continue;

    const normalized = normalizeDeltaPayload(event.payload);
    if (!normalized) continue;

    const eventType = normalized.type;
    if (typeof eventType !== "string") continue;

    switch (eventType) {
      case "start-step":
        parts.push({ type: "step-start" });
        break;

      case "reasoning-start":
        currentReasoningText = "";
        parts.push({
          type: "reasoning",
          text: "",
          state: "streaming",
        });
        break;

      case "reasoning-delta": {
        currentReasoningText += String(normalized.delta ?? "");
        const reasoningIndex = findLastPartIndex(
          parts,
          (part) => part.type === "reasoning",
        );
        if (reasoningIndex !== -1) {
          parts[reasoningIndex] = {
            type: "reasoning",
            text: currentReasoningText,
            state: "streaming",
          };
        }
        break;
      }

      case "reasoning-end": {
        const reasoningIndex = findLastPartIndex(
          parts,
          (part) => part.type === "reasoning",
        );
        if (reasoningIndex !== -1) {
          parts[reasoningIndex] = {
            type: "reasoning",
            text: currentReasoningText,
            state: "done",
          };
        }
        break;
      }

      case "text-start":
        currentTextContent = "";
        parts.push({
          type: "text",
          text: "",
          state: "streaming",
        });
        break;

      case "text-delta": {
        currentTextContent += String(normalized.delta ?? "");
        const textIndex = findLastPartIndex(parts, (part) => part.type === "text");
        if (textIndex !== -1) {
          parts[textIndex] = {
            type: "text",
            text: currentTextContent,
            state: "streaming",
          };
        }
        break;
      }

      case "text-end": {
        const textIndex = findLastPartIndex(parts, (part) => part.type === "text");
        if (textIndex !== -1) {
          parts[textIndex] = {
            type: "text",
            text: currentTextContent,
            state: "done",
          };
        }
        break;
      }

      case "tool-input-start":
        if (
          typeof normalized.toolCallId === "string" &&
          typeof normalized.toolName === "string"
        ) {
          parts.push({
            type: "tool-call",
            toolCallId: normalized.toolCallId,
            toolName: normalized.toolName,
            state: "streaming-input",
            inputText: "",
          });
        }
        break;

      case "tool-input-delta":
        if (typeof normalized.toolCallId !== "string") break;
        {
          const toolCallIndex = findLastPartIndex(
            parts,
            (part) =>
              part.type === "tool-call" &&
              part.toolCallId === normalized.toolCallId,
          );
          if (toolCallIndex === -1) break;
          const toolPart = parts[toolCallIndex];
          if (toolPart.type !== "tool-call") break;

          parts[toolCallIndex] = {
            ...toolPart,
            inputText:
              (toolPart.inputText ?? "") + String(normalized.inputTextDelta ?? ""),
          };
        }
        break;

      case "tool-input-available":
        if (typeof normalized.toolCallId !== "string") break;
        {
          const toolCallIndex = findLastPartIndex(
            parts,
            (part) =>
              part.type === "tool-call" &&
              part.toolCallId === normalized.toolCallId,
          );
          if (toolCallIndex === -1) break;
          const toolPart = parts[toolCallIndex];
          if (toolPart.type !== "tool-call") break;

          parts[toolCallIndex] = {
            ...toolPart,
            state: "input-available",
            input: isRecord(normalized.input) ? normalized.input : undefined,
          };
        }
        break;

      case "tool-output-available":
        if (typeof normalized.toolCallId !== "string") break;
        {
          const toolCallIndex = findLastPartIndex(
            parts,
            (part) =>
              part.type === "tool-call" &&
              part.toolCallId === normalized.toolCallId,
          );
          if (toolCallIndex === -1) break;
          const toolPart = parts[toolCallIndex];
          if (toolPart.type !== "tool-call") break;

          parts[toolCallIndex] = {
            ...toolPart,
            state: "output-available",
            output: normalized.output,
          };
        }
        break;

      default:
        break;
    }
  }

  return normalizePartsForStorage(parts);
};

const listAllRunEvents = async (
  runId: string,
  userId: string,
): Promise<ChatRunEventEntity[]> => {
  const events: ChatRunEventEntity[] = [];
  let afterSeq = 0;

  while (true) {
    const batch = await chatStore.listChatRunEvents(runId, {
      afterSeq,
      userId,
      limit: 1000,
    });

    if (batch.length === 0) {
      return events;
    }

    events.push(...batch);
    afterSeq = batch[batch.length - 1].seq;

    if (batch.length < 1000) {
      return events;
    }
  }
};

const recoverStalledRun = async (
  run: ChatRunEntity,
  userId: string,
  errorMessage: string,
) => {
  const latestRun = await chatStore.getChatRun(run.id, userId);
  if (!latestRun || latestRun.status !== "running") {
    return;
  }

  const events = await listAllRunEvents(latestRun.id, userId);
  const recoveredParts = rebuildAssistantPartsFromEvents(events);

  await chatStore.updateMessage(
    latestRun.chatId,
    latestRun.assistantMessageId,
    {
      parts: recoveredParts,
      status: "error",
      visible: true,
    },
    userId,
  );

  await chatStore.updateChat(
    latestRun.chatId,
    {
      cursorMessageId: latestRun.assistantMessageId,
    },
    userId,
  );

  await appendRunDeltaEvent(latestRun.id, userId, {
    type: "finish",
    finishReason: "error",
    error: {
      message: errorMessage,
    },
  });

  await appendRunMetaEvent(latestRun.id, userId, "message_stream_complete", {
    type: "message_stream_complete",
    conversation_id: latestRun.chatId,
    run_id: latestRun.id,
    status: "error",
  });

  await chatStore.completeChatRun(latestRun.id, "error", userId);
};

const recoverStalledRunOnce = async (
  run: ChatRunEntity,
  userId: string,
  errorMessage: string,
) => {
  const ongoing = stalledRunRecoveryTasks.get(run.id);
  if (ongoing) {
    await ongoing;
    return;
  }

  const task = recoverStalledRun(run, userId, errorMessage).finally(() => {
    stalledRunRecoveryTasks.delete(run.id);
  });
  stalledRunRecoveryTasks.set(run.id, task);

  await task;
};

const appendRunDeltaEvent = async (
  runId: string,
  userId: string,
  payload: Record<string, unknown>,
) => {
  await chatStore.appendChatRunEvent(
    runId,
    "delta",
    {
      o: "add",
      v: payload,
    },
    userId,
  );
};

const appendRunMetaEvent = async (
  runId: string,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) => {
  await chatStore.appendChatRunEvent(runId, event, payload, userId);
};

const finalizeRun = async (
  input: RunExecutionInput,
  assistantParts: MessagePartV2[],
  status: "done" | "aborted" | "error",
  finishReason: "stop" | "abort" | "error",
  errorMessage?: string,
) => {
  await chatStore.updateMessage(
    input.chatId,
    input.assistantMessageId,
    {
      parts: normalizePartsForStorage(assistantParts),
      model: input.model,
      status,
      visible: true,
    },
    input.userId,
  );

  await chatStore.updateChat(
    input.chatId,
    {
      cursorMessageId: input.assistantMessageId,
    },
    input.userId,
  );

  await appendRunDeltaEvent(input.runId, input.userId, {
    type: "finish",
    finishReason,
    ...(errorMessage
      ? {
          error: {
            message: errorMessage,
          },
        }
      : {}),
  });

  await appendRunMetaEvent(input.runId, input.userId, "message_stream_complete", {
    type: "message_stream_complete",
    conversation_id: input.chatId,
    run_id: input.runId,
    status,
  });

  await chatStore.completeChatRun(input.runId, status, input.userId);
};

async function executeRun(input: RunExecutionInput, signal: AbortSignal) {
  const reasoningId = `rs_${generateId()}`;
  const textId = `msg_${generateId()}`;
  const assistantParts: MessagePartV2[] = [];

  const shouldUseWeatherTool = isWeatherQuery(input.userText);
  const city = extractCity(input.userText);

  try {
    await appendRunDeltaEvent(input.runId, input.userId, {
      type: "start",
      messageId: input.assistantMessageId,
      modelId: input.model,
    });
    await delay(50, signal);

    assistantParts.push({ type: "step-start" });
    await appendRunDeltaEvent(input.runId, input.userId, {
      type: "start-step",
    });
    await delay(50, signal);

    if (shouldUseWeatherTool) {
      const toolCallId = `call_${generateId()}`;
      const toolName = "weather";
      const reasoningText = `用户想查询天气信息，我需要调用天气工具来获取 ${city} 的天气数据。`;

      assistantParts.push({
        type: "reasoning",
        text: "",
        state: "streaming",
      });

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "reasoning-start",
        id: reasoningId,
      });
      await delay(30, signal);

      for (const char of reasoningText) {
        throwIfAborted(signal);

        const reasoningPart = assistantParts[assistantParts.length - 1];
        if (reasoningPart.type === "reasoning") {
          reasoningPart.text += char;
        }

        await appendRunDeltaEvent(input.runId, input.userId, {
          type: "reasoning-delta",
          id: reasoningId,
          delta: char,
        });
        await delay(15, signal);
      }

      const reasoningPart = assistantParts[assistantParts.length - 1];
      if (reasoningPart.type === "reasoning") {
        reasoningPart.state = "done";
      }

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "reasoning-end",
        id: reasoningId,
      });
      await delay(50, signal);

      assistantParts.push({
        type: "tool-call",
        toolCallId,
        toolName,
        state: "streaming-input",
        inputText: "",
      });

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "tool-input-start",
        toolCallId,
        toolName,
      });
      await delay(50, signal);

      const inputJson = JSON.stringify({ location: city });
      for (const char of inputJson) {
        throwIfAborted(signal);

        const toolPart = assistantParts[assistantParts.length - 1];
        if (toolPart.type === "tool-call") {
          toolPart.inputText = (toolPart.inputText ?? "") + char;
        }

        await appendRunDeltaEvent(input.runId, input.userId, {
          type: "tool-input-delta",
          toolCallId,
          inputTextDelta: char,
        });
        await delay(30, signal);
      }

      await delay(100, signal);
      const toolPart = assistantParts[assistantParts.length - 1];
      if (toolPart.type === "tool-call") {
        toolPart.state = "input-available";
        toolPart.input = { location: city };
      }

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "tool-input-available",
        toolCallId,
        toolName,
        input: { location: city },
      });
      await delay(350, signal);

      const weatherOutput = {
        ...mockWeatherData,
        location: city,
      };

      if (toolPart.type === "tool-call") {
        toolPart.state = "output-available";
        toolPart.output = weatherOutput;
      }

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "tool-output-available",
        toolCallId,
        output: weatherOutput,
      });
      await delay(100, signal);

      assistantParts.push({
        type: "text",
        text: "",
        state: "streaming",
      });

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "text-start",
        id: textId,
      });
      await delay(30, signal);

      const responseText = `根据天气查询结果，${city} 现在的天气是 ${weatherOutput.condition.text}，温度 ${weatherOutput.temperature}°C。今天最高温度 ${weatherOutput.temperatureHigh}°C，最低温度 ${weatherOutput.temperatureLow}°C。湿度 ${weatherOutput.humidity}%，风速 ${weatherOutput.windSpeed} km/h。`;

      for (const char of responseText) {
        throwIfAborted(signal);

        const textPart = assistantParts[assistantParts.length - 1];
        if (textPart.type === "text") {
          textPart.text += char;
        }

        await appendRunDeltaEvent(input.runId, input.userId, {
          type: "text-delta",
          id: textId,
          delta: char,
        });
        await delay(20, signal);
      }

      const textPart = assistantParts[assistantParts.length - 1];
      if (textPart.type === "text") {
        textPart.state = "done";
      }

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "text-end",
        id: textId,
      });
    } else {
      const reasoningText = `让我思考一下这个问题...用户说的是: "${input.userText}"。我需要理解这个请求并给出合适的回复。`;
      const longTestLines = Array.from(
        { length: 20 },
        (_, index) =>
          `- 流式续传测试行 ${index + 1}: 如果你在此时刷新页面，应该还能从断点继续输出。`,
      );
      const responseText = [
        `你好！我收到了你的消息："${input.userText}"。`,
        "",
        "下面是一段加长的模拟回复，用于测试“刷新后继续流式输出”。",
        "你可以在任意时刻刷新页面，观察内容是否会从上次序号继续。",
        "",
        "【测试说明】",
        "1. 发送任意短消息（例如：1）。",
        "2. 等待输出到中间位置时刷新。",
        "3. 检查是否继续新增内容，而不是从头重复。",
        "",
        "【连续输出内容】",
        ...longTestLines,
        "",
        "如果你能看到这段结尾，说明本次长流已完整结束。",
      ].join("\n");

      assistantParts.push({
        type: "reasoning",
        text: "",
        state: "streaming",
      });

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "reasoning-start",
        id: reasoningId,
      });
      await delay(30, signal);

      for (const char of reasoningText) {
        throwIfAborted(signal);

        const reasoningPart = assistantParts[assistantParts.length - 1];
        if (reasoningPart.type === "reasoning") {
          reasoningPart.text += char;
        }

        await appendRunDeltaEvent(input.runId, input.userId, {
          type: "reasoning-delta",
          id: reasoningId,
          delta: char,
        });
        await delay(20, signal);
      }

      const reasoningPart = assistantParts[assistantParts.length - 1];
      if (reasoningPart.type === "reasoning") {
        reasoningPart.state = "done";
      }

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "reasoning-end",
        id: reasoningId,
      });
      await delay(40, signal);

      assistantParts.push({
        type: "text",
        text: "",
        state: "streaming",
      });

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "text-start",
        id: textId,
      });
      await delay(30, signal);

      for (const char of responseText) {
        throwIfAborted(signal);

        const textPart = assistantParts[assistantParts.length - 1];
        if (textPart.type === "text") {
          textPart.text += char;
        }

        await appendRunDeltaEvent(input.runId, input.userId, {
          type: "text-delta",
          id: textId,
          delta: char,
        });
        await delay(30, signal);
      }

      const textPart = assistantParts[assistantParts.length - 1];
      if (textPart.type === "text") {
        textPart.state = "done";
      }

      await appendRunDeltaEvent(input.runId, input.userId, {
        type: "text-end",
        id: textId,
      });
    }

    await delay(50, signal);
    await appendRunDeltaEvent(input.runId, input.userId, {
      type: "finish-step",
    });

    await finalizeRun(input, assistantParts, "done", "stop");
  } catch (error) {
    if (error instanceof StreamAbortedError) {
      await finalizeRun(input, assistantParts, "aborted", "abort");
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unknown generation error";

    await finalizeRun(input, assistantParts, "error", "error", message);
  }
}

const startRunExecution = (input: RunExecutionInput) => {
  if (runAbortControllers.has(input.runId)) {
    return;
  }

  const controller = new AbortController();
  runAbortControllers.set(input.runId, controller);

  void executeRun(input, controller.signal)
    .catch((error) => {
      console.error(`[Chat ${input.chatId}] run ${input.runId} failed`, error);
    })
    .finally(() => {
      runAbortControllers.delete(input.runId);
    });
};

const cancelRunExecution = (runId: string) => {
  const controller = runAbortControllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
};

export async function createChatRunHandler(request: Request, chatId: string) {
  const userId = resolveRequestUserId(request);

  let body: ReturnType<typeof parseStreamChatRequest>;
  try {
    body = parseStreamChatRequest(await request.json());
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid request body",
      400,
    );
  }

  const chat = await chatStore.getChat(chatId, userId);
  if (!chat) {
    return jsonError("Chat not found", 404);
  }

  const rootId = getConversationRootId(chatId);
  const normalizedParentId = body.parentId === rootId ? null : body.parentId;

  const incomingSettings = body.settings
    ? { enabledWebSearch: body.settings.enabled_web_search }
    : undefined;

  if (
    incomingSettings &&
    incomingSettings.enabledWebSearch !== chat.settings.enabledWebSearch
  ) {
    try {
      await chatStore.updateChat(
        chatId,
        {
          settings: incomingSettings,
        },
        userId,
      );
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Failed to persist settings",
        500,
      );
    }
  }

  const userMessage = toChatMessageV2(chatId, body.message);
  try {
    await chatStore.appendUserNodeIfMissing(chatId, normalizedParentId, userMessage);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid parentId",
      400,
    );
  }

  const model = body.model || DEFAULT_MODEL;
  const userText =
    userMessage.parts.find((part) => part.type === "text")?.text ?? "";

  const assistantMessageId = generateId();
  const runId = `run_${generateId()}`;
  const resumeToken = `rt_${generateId()}`;

  try {
    await chatStore.createMessage({
      id: assistantMessageId,
      chatId,
      parentId: userMessage.id,
      role: "assistant",
      model,
      status: "streaming",
      parts: [],
      createdAt: new Date().toISOString(),
      visible: true,
    });

    await chatStore.updateChat(
      chatId,
      {
        cursorMessageId: assistantMessageId,
      },
      userId,
    );

    await chatStore.createChatRun({
      id: runId,
      chatId,
      userId,
      assistantMessageId,
      parentMessageId: userMessage.id,
      resumeToken,
      status: "running",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Failed to initialize chat run",
      500,
    );
  }

  startRunExecution({
    runId,
    chatId,
    userId,
    model,
    userText,
    assistantMessageId,
  });

  return Response.json(
    {
      run_id: runId,
      assistant_message_id: assistantMessageId,
      resume_token: resumeToken,
      last_seq: 0,
      status: "running",
      conversation_id: chatId,
    },
    { status: 201 },
  );
}

export async function streamChatRunHandler(
  request: Request,
  chatId: string,
  runId: string,
) {
  const userId = resolveRequestUserId(request);
  const url = new URL(request.url);
  const afterSeqRaw = url.searchParams.get("afterSeq");
  const resumeToken = url.searchParams.get("resumeToken") ?? undefined;

  let afterSeq = Number(afterSeqRaw ?? 0);
  if (!Number.isFinite(afterSeq) || afterSeq < 0) {
    afterSeq = 0;
  }
  afterSeq = Math.floor(afterSeq);

  const run = await chatStore.getChatRun(runId, userId);
  if (!run || run.chatId !== chatId) {
    return jsonError("Run not found", 404);
  }

  if (resumeToken && resumeToken !== run.resumeToken) {
    return jsonError("Invalid resume token", 403);
  }

  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let cursor = afterSeq;
      let stalledSinceMs: number | null = null;

      try {
        sendSseFrame(controller, encoder, {
          event: "delta_encoding",
          data: "v1",
        });

        sendSseFrame(controller, encoder, {
          event: "resume_conversation_token",
          data: {
            kind: "chat-run",
            token: run.resumeToken,
            conversation_id: chatId,
            run_id: run.id,
            assistant_message_id: run.assistantMessageId,
          },
        });

        while (!cancelled) {
          const events = await chatStore.listChatRunEvents(run.id, {
            afterSeq: cursor,
            userId,
            limit: 200,
          });

          for (const event of events) {
            cursor = event.seq;
            sendSseFrame(controller, encoder, {
              id: event.seq,
              event: event.event,
              data: event.payload as object | string,
            });
          }

          const latestRun = await chatStore.getChatRun(run.id, userId);
          if (!latestRun) {
            sendSseFrame(controller, encoder, {
              event: "error",
              data: {
                message: "Run deleted",
              },
            });
            sendSseEvent(controller, encoder, "[DONE]");
            controller.close();
            return;
          }

          if (latestRun.status === "running") {
            const hasNoNewEvents = events.length === 0;
            const hasCaughtUp = cursor >= latestRun.lastEventSeq;

            if (
              hasNoNewEvents &&
              hasCaughtUp &&
              !runAbortControllers.has(run.id)
            ) {
              if (stalledSinceMs === null) {
                stalledSinceMs = Date.now();
              }

              if (Date.now() - stalledSinceMs >= RUN_STALL_TIMEOUT_MS) {
                const stallMessage = `Run stalled: no new events for ${RUN_STALL_TIMEOUT_MS}ms`;
                console.warn(
                  `[Chat ${chatId}] recovering stalled run ${run.id}`,
                  {
                    runId: run.id,
                    cursor,
                    lastEventSeq: latestRun.lastEventSeq,
                  },
                );
                await recoverStalledRunOnce(run, userId, stallMessage);
                stalledSinceMs = null;
                continue;
              }
            } else {
              stalledSinceMs = null;
            }
          } else {
            stalledSinceMs = null;
          }

          if (latestRun.status !== "running") {
            const hasPending = await chatStore.listChatRunEvents(run.id, {
              afterSeq: cursor,
              userId,
              limit: 1,
            });

            if (hasPending.length === 0) {
              sendSseEvent(controller, encoder, "[DONE]");
              controller.close();
              return;
            }
          }

          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!cancelled) {
          sendSseFrame(controller, encoder, {
            event: "error",
            data: {
              message: error instanceof Error ? error.message : "Stream error",
            },
          });
          sendSseEvent(controller, encoder, "[DONE]");
          controller.close();
        }
      }
    },
    cancel() {
      // The run continues server-side; this only closes the current subscriber.
      cancelled = true;
    },
  });

  return createSseResponse(stream);
}

export async function cancelChatRunHandler(
  request: Request,
  chatId: string,
  runId: string,
) {
  const userId = resolveRequestUserId(request);
  const run = await chatStore.getChatRun(runId, userId);

  if (!run || run.chatId !== chatId) {
    return jsonError("Run not found", 404);
  }

  if (run.status !== "running") {
    return Response.json({
      success: true,
      run_id: run.id,
      status: run.status,
      requested: false,
    });
  }

  const requested = cancelRunExecution(run.id);

  await chatStore.completeChatRun(run.id, "aborted", userId);

  return Response.json({
    success: true,
    run_id: run.id,
    status: "aborted",
    requested,
  });
}
