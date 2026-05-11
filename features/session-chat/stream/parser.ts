import { createParser, type EventSourceMessage } from "eventsource-parser";
import { produce } from "immer";
import { applyStreamData as applyCoreStreamData } from "@/lib/chat-core/client/stream-parser";
import type {
  ChatCompletionOptions,
  ChatFragment,
  ChatMessage,
  ChatPatchTarget,
  ChatReadyEventPayload,
  ChatSessionPatch,
  ChatTitleType,
  ChatState,
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

function resolvePatchTarget(
  state: ChatState,
  context: ChatStreamPatchContext,
  target: ChatPatchTarget,
) {
  const responseMessage = getResponseMessage(state, context);
  if (!responseMessage) return null;

  if (target.type === "response") return responseMessage;

  return (
    responseMessage.fragments.find(
      (fragment: ChatFragment) => fragment.id === target.id,
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
      isResponseMessage: isChatMessage,
      getResponseMessageId: (value) =>
        isChatMessage(value) ? value.message_id : null,
      upsertResponse: (draft, response) => {
        if (!isChatMessage(response)) return;
        upsertMessage(draft.chat_messages, response);
        context.responseMessageIndex = findResponseMessageIndex(
          draft,
          response.message_id,
        );
        draft.chat_session.current_message_id = response.message_id;
      },
      resolvePatchTarget: (draft, target) =>
        resolvePatchTarget(draft, context, target),
    },
    data,
  );
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
