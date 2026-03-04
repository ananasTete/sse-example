import { createParser, EventSourceParser } from "eventsource-parser";
import { MessagePartV2, OnDataCallbackV2 } from "../hooks/use-chat-v2/types";
import { applyAssistantEvent } from "../hooks/use-chat-v2/sse-parser/apply-assistant-event";
import {
  isRecord,
  normalizeTransportPayload,
} from "../hooks/use-chat-v2/sse-parser/transport";
import type { ChatEngineState } from "./chat-engine-state";

const TRANSPORT_ERROR_MESSAGE = "Stream transport error";

const parseTransportErrorMessage = (rawData: string) => {
  try {
    const parsed = JSON.parse(rawData);
    if (isRecord(parsed) && typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    // noop
  }

  return TRANSPORT_ERROR_MESSAGE;
};

export interface SseFrameMetaV2 {
  id?: string;
  event?: string;
  data: string;
}

export interface ParserContextV2 {
  assistantNodeId: string;
  engineState: ChatEngineState;
  onData?: OnDataCallbackV2;
  onSseFrame?: (meta: SseFrameMetaV2) => boolean | void;
}

export interface ParserResultV2 {
  parser: EventSourceParser;
  getServerError: () => Error | null;
  getAssistantNodeId: () => string;
}

export function createEngineSSEParser(
  context: ParserContextV2,
): ParserResultV2 {
  const { engineState, onData, onSseFrame } = context;
  let assistantNodeId = context.assistantNodeId;
  let serverError: Error | null = null;

  const updateAssistantParts = (
    updater: (parts: MessagePartV2[]) => MessagePartV2[],
  ) => {
    engineState.updateAssistantParts(assistantNodeId, updater);
  };

  const parser = createParser({
    onEvent: (event) => {
      const data = event.data;
      const shouldProcessFrame = onSseFrame?.({
        id: event.id || undefined,
        event: event.event || undefined,
        data,
      });
      if (shouldProcessFrame === false) return;
      if (data === "[DONE]") return;

      if (event.event === "error") {
        serverError = new Error(parseTransportErrorMessage(data));
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const normalized = normalizeTransportPayload(event.event, parsed);
        if (!isRecord(normalized)) return;

        onData?.(data);

        assistantNodeId = applyAssistantEvent({
          event: normalized,
          assistantNodeId,
          renameAssistantNode: (fromId, toId, model) => {
            engineState.renameAssistantNode(fromId, toId, model);
          },
          updateAssistantMessage: (nodeId, updates) => {
            if (updates.model) {
              engineState.updateAssistantMessage(nodeId, updates);
            }
          },
          updateAssistantParts,
          setServerError: (error) => {
            serverError = error;
          },
        });
      } catch {
        // noop: non-JSON frames are ignored.
      }
    },
  });

  return {
    parser,
    getServerError: () => serverError,
    getAssistantNodeId: () => assistantNodeId,
  };
}
