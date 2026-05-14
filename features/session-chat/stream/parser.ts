import type {
  ChatMessage,
  ChatReadyEventPayload,
  ChatSessionPatch,
  ChatState,
  PatchContext,
} from "../types";
import { createPatchStreamParser } from "@/lib/chat-core/client/stream-parser";
import type {
  ReadyPayload,
  SessionPayload,
  ErrorPayload,
} from "@/lib/chat-core";
import { upsertMessage } from "./messages";

export type ChatStateUpdater = (
  updater: (currentState: ChatState | undefined) => ChatState | undefined,
) => void;

export interface ChatCompletionStreamCallbacks {
  onReady?: (payload: ChatReadyEventPayload) => void;
  onSessionPatch?: (patch: ChatSessionPatch) => void;
  onTitle?: (title: string) => void;
  onDone?: () => void;
}

interface CreateChatCompletionParserOptions extends ChatCompletionStreamCallbacks {
  updateState: ChatStateUpdater;
  patchContext: PatchContext;
  onError: (error: Error) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatMessage = (value: unknown): value is ChatMessage =>
  isRecord(value) &&
  typeof value.message_id === "number" &&
  (value.role === "USER" || value.role === "ASSISTANT") &&
  Array.isArray(value.blocks);

export function createChatCompletionParser({
  updateState,
  patchContext,
  onReady,
  onSessionPatch,
  onTitle,
  onDone,
  onError,
}: CreateChatCompletionParserOptions) {
  // 客户端维护要更新的响应消息 ID
  let activeResponseMessageId: number | null = null;

  const findResponseMessage = (state: ChatState): ChatMessage | null => {
    if (activeResponseMessageId === null) return null;
    return (
      state.chat_messages.find(
        (m) =>
          m.message_id === activeResponseMessageId && m.role === "ASSISTANT",
      ) ?? null
    );
  };

  return createPatchStreamParser<ChatState>({
    updateState,
    patchContext,

    onReady(data: ReadyPayload) {
      activeResponseMessageId = data.response_message_id;
      onReady?.({
        response_message_id: data.response_message_id,
        user_message_id: data.user_message_id,
        session_id: data.session_id,
      });
    },

    onUpsertMessage(message: Record<string, unknown>) {
      if (!isChatMessage(message)) return;
      activeResponseMessageId = message.message_id;
      updateState((state) => {
        if (!state) return state;
        const next = { ...state, chat_messages: [...state.chat_messages] };
        upsertMessage(next.chat_messages, message as unknown as ChatMessage);
        next.chat_session = {
          ...next.chat_session,
          current_message_id: message.message_id,
        };
        return next;
      });
    },

    onSession(data: SessionPayload) {
      const patch: ChatSessionPatch = {};
      if (data.title !== undefined) patch.title = data.title;
      if (data.updated_at !== undefined) patch.updated_at = data.updated_at;
      updateState((state) => {
        if (!state || Object.keys(patch).length === 0) return state;
        return {
          ...state,
          chat_session: {
            ...state.chat_session,
            ...patch,
          },
        };
      });
      onSessionPatch?.(patch);
      if (typeof data.title === "string") onTitle?.(data.title);
    },

    onDone() {
      onDone?.();
    },

    onError(data: ErrorPayload) {
      onError(new Error(data.message || "生成失败"));
    },

    onParseError(error: Error) {
      onError(error);
    },

    resolveMessage(state: ChatState) {
      return findResponseMessage(state);
    },
  });
}
