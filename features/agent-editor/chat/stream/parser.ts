import { createPatchStreamParser } from "@/lib/chat-core/client/stream-parser";
import type {
  ErrorPayload,
  ReadyPayload,
  SessionPayload,
} from "@/lib/chat-core";
import type {
  AgentChatMessage,
  AgentChatReadyEventPayload,
  AgentChatSessionPatch,
  AgentChatState,
  PatchContext,
} from "../types";
import { upsertMessage } from "./messages";

export type AgentChatStateUpdater = (
  updater: (
    currentState: AgentChatState | undefined,
  ) => AgentChatState | undefined,
) => void;

export interface AgentChatCompletionStreamCallbacks {
  onReady?: (payload: AgentChatReadyEventPayload) => void;
  onSessionPatch?: (patch: AgentChatSessionPatch) => void;
  onTitle?: (title: string) => void;
  onDone?: () => void;
}

interface CreateAgentChatCompletionParserOptions
  extends AgentChatCompletionStreamCallbacks {
  updateState: AgentChatStateUpdater;
  patchContext: PatchContext;
  onError: (error: Error) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAgentChatMessage = (value: unknown): value is AgentChatMessage =>
  isRecord(value) &&
  typeof value.message_id === "number" &&
  (value.role === "USER" || value.role === "ASSISTANT") &&
  Array.isArray(value.blocks);

export function createAgentChatCompletionParser({
  updateState,
  patchContext,
  onReady,
  onSessionPatch,
  onTitle,
  onDone,
  onError,
}: CreateAgentChatCompletionParserOptions) {
  let activeResponseMessageId: number | null = null;

  const findResponseMessage = (
    state: AgentChatState,
  ): AgentChatMessage | null => {
    if (activeResponseMessageId === null) return null;
    return (
      state.chat_messages.find(
        (message) =>
          message.message_id === activeResponseMessageId &&
          message.role === "ASSISTANT",
      ) ?? null
    );
  };

  return createPatchStreamParser<AgentChatState>({
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
      if (!isAgentChatMessage(message)) return;
      activeResponseMessageId = message.message_id;
      updateState((state) => {
        if (!state) return state;
        const next = { ...state, chat_messages: [...state.chat_messages] };
        upsertMessage(next.chat_messages, message);
        next.chat_session = {
          ...next.chat_session,
          current_message_id: message.message_id,
        };
        return next;
      });
    },

    onSession(data: SessionPayload) {
      const patch: AgentChatSessionPatch = {};
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

    resolveMessage(state: AgentChatState) {
      return findResponseMessage(state);
    },
  });
}
