import { createParser, type EventSourceMessage } from "eventsource-parser";
import { produce } from "immer";
import type {
  ChatCompletionOptions,
  ChatMessage,
  ChatPatchOperation,
  ChatReadyEventPayload,
  ChatSessionPatch,
  ChatTitleType,
  ChatState,
  ChatStreamPatch,
  ChatStreamPatchContext,
} from "../types";
import { createUserMessage, upsertMessage } from "./messages";

export type ChatStateUpdater = (
  updater: (currentState: ChatState | undefined) => ChatState | undefined,
) => void;

export interface ChatCompletionStreamCallbacks {
  onReady?: () => void;
  onSessionPatch?: (patch: ChatSessionPatch) => void;
  onTitle?: (title: string) => void;
}

interface CreateChatCompletionParserOptions extends ChatCompletionStreamCallbacks {
  options: ChatCompletionOptions;
  updateState: ChatStateUpdater;
  patchContext: ChatStreamPatchContext;
  onError: (error: Error) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatPatchOperation = (value: unknown): value is ChatPatchOperation =>
  value === "APPEND" || value === "SET" || value === "BATCH";

const isChatTitleType = (value: unknown): value is ChatTitleType =>
  value === "WIP" || value === "SYSTEM" || value === "USER";

const isChatMessage = (value: unknown): value is ChatMessage =>
  isRecord(value) &&
  typeof value.message_id === "number" &&
  (value.role === "USER" || value.role === "ASSISTANT") &&
  Array.isArray(value.fragments);

function createSessionPatch(data: Record<string, unknown>): ChatSessionPatch {
  const patch: ChatSessionPatch = {};

  if (typeof data.id === "string") patch.id = data.id;
  if (typeof data.title === "string" || data.title === null) {
    patch.title = data.title;
  }
  if (isChatTitleType(data.title_type)) patch.title_type = data.title_type;
  if (typeof data.model_type === "string") patch.model_type = data.model_type;
  if (typeof data.pinned === "boolean") patch.pinned = data.pinned;
  if (typeof data.updated_at === "number") patch.updated_at = data.updated_at;
  if (typeof data.seq_id === "number") patch.seq_id = data.seq_id;
  if (typeof data.agent === "string") patch.agent = data.agent;
  if (typeof data.version === "number") patch.version = data.version;
  if (typeof data.is_empty === "boolean") patch.is_empty = data.is_empty;
  if (
    typeof data.current_message_id === "number" ||
    data.current_message_id === null
  ) {
    patch.current_message_id = data.current_message_id;
  }
  if (typeof data.inserted_at === "number")
    patch.inserted_at = data.inserted_at;

  return patch;
}

function findResponseMessageIndex(state: ChatState, messageId: number | null) {
  if (messageId === null) return null;

  for (let index = state.chat_messages.length - 1; index >= 0; index -= 1) {
    const message = state.chat_messages[index];
    if (message.message_id === messageId && message.role === "ASSISTANT") {
      return index;
    }
  }

  return null;
}

function getResponseMessage(
  state: ChatState,
  context: ChatStreamPatchContext,
) {
  const cachedIndex = context.responseMessageIndex;
  const cachedMessage =
    typeof cachedIndex === "number" ? state.chat_messages[cachedIndex] : null;

  if (
    cachedMessage &&
    cachedMessage.message_id === context.responseMessageId &&
    cachedMessage.role === "ASSISTANT"
  ) {
    return cachedMessage;
  }

  const responseMessageIndex = findResponseMessageIndex(
    state,
    context.responseMessageId,
  );
  context.responseMessageIndex = responseMessageIndex;

  return typeof responseMessageIndex === "number"
    ? state.chat_messages[responseMessageIndex]
    : null;
}

function resolveArrayIndex(array: unknown[], segment: string) {
  const index = segment === "-1" ? array.length - 1 : Number(segment);

  if (!Number.isInteger(index) || index < 0 || index >= array.length) {
    return null;
  }

  return index;
}

function applyPathPatch(
  target: unknown,
  path: string,
  operation: ChatPatchOperation,
  value: unknown,
) {
  const segments = path.split("/").filter(Boolean);
  let cursor = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    if (Array.isArray(cursor)) {
      const arrayIndex = resolveArrayIndex(cursor, segments[index]);
      if (arrayIndex === null) return;

      cursor = cursor[arrayIndex];
      continue;
    }

    if (!isRecord(cursor)) return;
    cursor = cursor[segments[index]];
  }

  const lastSegment = segments.at(-1);
  if (!lastSegment) return;

  if (Array.isArray(cursor)) {
    const arrayIndex = resolveArrayIndex(cursor, lastSegment);
    if (arrayIndex === null) return;

    if (operation === "APPEND" && Array.isArray(cursor[arrayIndex])) {
      (cursor[arrayIndex] as unknown[]).push(value);
      return;
    }

    cursor[arrayIndex] =
      operation === "APPEND" && typeof cursor[arrayIndex] === "string"
        ? `${cursor[arrayIndex]}${String(value)}`
        : value;
    return;
  }

  if (!isRecord(cursor)) return;

  if (operation === "APPEND") {
    const currentValue = cursor[lastSegment];
    if (Array.isArray(currentValue)) {
      if (Array.isArray(value)) {
        currentValue.push(...value);
      } else {
        currentValue.push(value);
      }
      return;
    }

    if (typeof currentValue === "string") {
      cursor[lastSegment] = currentValue + String(value);
      return;
    }
  }

  cursor[lastSegment] = value;
}

function applyPatchToResponse(
  state: ChatState,
  context: ChatStreamPatchContext,
  patch: Required<Pick<ChatStreamPatch, "p" | "v">> & {
    o?: ChatPatchOperation;
  },
) {
  const responseMessage = getResponseMessage(state, context);
  if (!responseMessage) return;

  const operation = patch.o ?? "SET";
  if (operation === "BATCH" && Array.isArray(patch.v)) {
    for (const childPatch of patch.v) {
      if (!isRecord(childPatch) || typeof childPatch.p !== "string") continue;
      applyPathPatch(
        responseMessage,
        childPatch.p,
        isChatPatchOperation(childPatch.o) ? childPatch.o : "SET",
        childPatch.v,
      );
    }
    return;
  }

  const relativePath = patch.p.startsWith("response/")
    ? patch.p.slice("response/".length)
    : patch.p === "response"
      ? ""
      : patch.p;

  if (relativePath) {
    applyPathPatch(responseMessage, relativePath, operation, patch.v);
  }
}

function applyStreamData(
  currentState: ChatState | undefined,
  context: ChatStreamPatchContext,
  data: unknown,
) {
  if (!currentState || !isRecord(data)) return currentState;

  return produce(currentState, (draft) => {
    // v
    if (isRecord(data.v) && isChatMessage(data.v.response)) {
      const responseMessage = data.v.response;
      // 重置上次操作记录
      context.responseMessageId = responseMessage.message_id;
      context.responseMessageIndex = null;
      context.lastPath = null;
      context.lastOperation = null;
      // 添加响应到本地镜像
      upsertMessage(draft.chat_messages, responseMessage);
      context.responseMessageIndex = findResponseMessageIndex(
        draft,
        responseMessage.message_id,
      );
      // 更新 current_message_id
      draft.chat_session.current_message_id = responseMessage.message_id;
      return;
    }

    // p + o + v
    if (typeof data.p === "string") {
      const operation = isChatPatchOperation(data.o) ? data.o : "SET";
      applyPatchToResponse(draft, context, {
        p: data.p,
        o: operation,
        v: data.v,
      });
      context.lastPath = data.p;
      context.lastOperation = operation;
      return;
    }

    // v
    if ("v" in data && context.lastPath) {
      applyPatchToResponse(draft, context, {
        p: context.lastPath,
        o: context.lastOperation ?? "SET",
        v: data.v,
      });
    }
  });
}

export function createChatCompletionParser({
  options,
  updateState,
  patchContext,
  onReady,
  onSessionPatch,
  onTitle,
  onError,
}: CreateChatCompletionParserOptions) {
  return createParser({
    onEvent: (event: EventSourceMessage) => {
      if (!event.data) return;

      try {
        const data = JSON.parse(event.data) as unknown;

        if (event.event === "ready" && isRecord(data)) {
          const ready = data as unknown as ChatReadyEventPayload;
          updateState((currentState) => {
            if (!currentState) return currentState;

            return produce(currentState, (draft) => {
              const optimisticUserMessageId = options.optimisticUserMessageId;
              const optimisticIndex =
                typeof optimisticUserMessageId === "number"
                  ? draft.chat_messages.findIndex(
                      (message) =>
                        message.message_id === optimisticUserMessageId &&
                        message.role === "USER",
                    )
                  : -1;

              if (optimisticIndex >= 0) {
                const optimisticMessage = draft.chat_messages[optimisticIndex];
                optimisticMessage.message_id = ready.request_message_id;
              } else {
                upsertMessage(
                  draft.chat_messages,
                  createUserMessage(ready.request_message_id, options),
                );
              }

              draft.chat_session.current_message_id = ready.response_message_id;
              draft.chat_session.model_type = ready.model_type;
            });
          });
          onReady?.();
          return;
        }

        if (event.event === "update_session" && isRecord(data)) {
          const sessionPatch = createSessionPatch(data);
          if (Object.keys(sessionPatch).length === 0) return;

          updateState((currentState) => {
            if (!currentState) return currentState;

            return produce(currentState, (draft) => {
              Object.assign(draft.chat_session, sessionPatch);
            });
          });
          onSessionPatch?.(sessionPatch);
          return;
        }

        if (event.event === "title" && isRecord(data)) {
          if (typeof data.content === "string") {
            onTitle?.(data.content);
          }

          updateState((currentState) => {
            if (!currentState || typeof data.content !== "string") {
              return currentState;
            }

            return produce(currentState, (draft) => {
              draft.chat_session.title = data.content as string;
              draft.chat_session.title_type = "SYSTEM";
            });
          });
          return;
        }

        if (event.event === "error" && isRecord(data)) {
          onError(
            new Error(
              typeof data.message === "string" ? data.message : "生成失败",
            ),
          );
          return;
        }

        if (!event.event) {
          updateState((currentState) =>
            applyStreamData(currentState, patchContext, data),
          );
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error("解析流式响应失败"));
      }
    },
  });
}
