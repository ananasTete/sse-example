import { createParser, type EventSourceMessage } from "eventsource-parser";
import { applyStreamData as applyCoreStreamData } from "@/lib/chat-core/client/stream-parser";
import type {
  ChatBlock,
  ChatMessage,
  ChatReadyEventPayload,
  ChatSessionPatch,
  ChatTitleType,
  ChatState,
  ChatStreamPatchContext,
  Target,
} from "../types";
import { upsertMessage } from "./messages";

export type ChatStateUpdater = (
  updater: (currentState: ChatState | undefined) => ChatState | undefined,
) => void;

export interface ChatCompletionStreamCallbacks {
  onReady?: (payload: ChatReadyEventPayload) => void;
  onSessionPatch?: (patch: ChatSessionPatch) => void;
  onTitle?: (title: string) => void;
}

interface CreateChatCompletionParserOptions extends ChatCompletionStreamCallbacks {
  updateState: ChatStateUpdater;
  patchContext: ChatStreamPatchContext;
  onError: (error: Error) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatTitleType = (value: unknown): value is ChatTitleType =>
  value === "WIP" || value === "SYSTEM" || value === "USER";

const isChatMessage = (value: unknown): value is ChatMessage =>
  isRecord(value) &&
  typeof value.message_id === "number" &&
  (value.role === "USER" || value.role === "ASSISTANT") &&
  Array.isArray(value.blocks);

const isAssistantMessage = (value: unknown): value is ChatMessage =>
  isChatMessage(value) && value.role === "ASSISTANT";

function createSessionPatch(data: Record<string, unknown>): ChatSessionPatch {
  const patch: ChatSessionPatch = {};

  if (typeof data.id === "string") patch.id = data.id;
  if (typeof data.title === "string" || data.title === null) {
    patch.title = data.title;
  }
  if (isChatTitleType(data.title_type)) patch.title_type = data.title_type;
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

function resolvePatchTarget(
  state: ChatState,
  context: ChatStreamPatchContext,
  target: Target,
) {
  if (target.type === "session") return state.chat_session;

  if (target.type === "message") {
    return (
      state.chat_messages.find((message) => message.message_id === target.id) ??
      null
    );
  }

  const parentMessageId =
    target.parent?.type === "message" ? Number(target.parent.id) : null;
  const responseMessage =
    parentMessageId !== null
      ? state.chat_messages.find(
          (message) => message.message_id === parentMessageId,
        ) ?? null
      : getResponseMessage(state, context);

  if (!responseMessage) return null;

  return (
    responseMessage.blocks.find(
      (block: ChatBlock) => block.id === target.id,
    ) ?? null
  );
}

function applyStreamData(
  currentState: ChatState | undefined,
  context: ChatStreamPatchContext,
  data: unknown,
) {
  return applyCoreStreamData(
    currentState,
    {
      updateState: () => {},
      patchContext: context,
      isResponseMessage: isAssistantMessage,
      getResponseMessageId: (value) =>
        isAssistantMessage(value) ? value.message_id : null,
      upsertResponse: (draft, response) => {
        if (!isAssistantMessage(response)) return;

        upsertMessage(draft.chat_messages, response);
        context.responseMessageIndex = findResponseMessageIndex(
          draft,
          response.message_id,
        );
        draft.chat_session.current_message_id = response.message_id;
      },
      resolveMutationTarget: (draft, target) =>
        resolvePatchTarget(draft, context, target),
    },
    data,
  );
}

function getMutationSessionPatch(
  data: unknown,
  context: ChatStreamPatchContext,
) {
  if (!isRecord(data)) return null;

  const target = isRecord(data.target)
    ? (data.target as unknown as Target)
    : context.lastTarget;
  const path = typeof data.path === "string" ? data.path : context.lastPath;

  if (target?.type !== "session" || path === null || !("value" in data)) {
    return null;
  }

  const sessionPatch = createSessionPatch({
    [path]: data.value,
  });

  return Object.keys(sessionPatch).length > 0 ? sessionPatch : null;
}

export function createChatCompletionParser({
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
          onReady?.({
            response_message_id: data.response_message_id as number,
            user_message_id: data.user_message_id as number,
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

        if (event.event) return;

        const sessionPatch = getMutationSessionPatch(data, patchContext);
        if (sessionPatch) {
          onSessionPatch?.(sessionPatch);
          if (typeof sessionPatch.title === "string") {
            onTitle?.(sessionPatch.title);
          }
        }

        updateState((currentState) =>
          applyStreamData(currentState, patchContext, data),
        );
      } catch (error) {
        onError(error instanceof Error ? error : new Error("解析流式响应失败"));
      }
    },
  });
}
