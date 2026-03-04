import { createParser, EventSourceParser } from "eventsource-parser";
import type { Dispatch } from "react";
import { ChatActionV2 } from "./reducer";
import { MessagePartV2, OnDataCallbackV2 } from "./types";
import { applyAssistantEvent } from "./sse-parser/apply-assistant-event";
import { isRecord, normalizeTransportPayload } from "./sse-parser/transport";

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
  dispatch: Dispatch<ChatActionV2>;
  onData?: OnDataCallbackV2;
  onSseFrame?: (meta: SseFrameMetaV2) => boolean | void;
}

export interface ParserResultV2 {
  parser: EventSourceParser;
  getServerError: () => Error | null;
  getAssistantNodeId: () => string;
}

export function createSSEParserV2(context: ParserContextV2): ParserResultV2 {
  const { dispatch, onData, onSseFrame } = context;
  let assistantNodeId = context.assistantNodeId;
  let serverError: Error | null = null;

  const updateAssistantParts = (
    updater: (parts: MessagePartV2[]) => MessagePartV2[],
  ) => {
    dispatch({
      type: "UPDATE_ASSISTANT_PARTS",
      payload: {
        nodeId: assistantNodeId,
        updater,
      },
    });
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
            dispatch({
              type: "RENAME_ASSISTANT_NODE",
              payload: {
                fromId,
                toId,
                ...(model ? { model } : {}),
              },
            });
          },
          updateAssistantMessage: (nodeId, updates) => {
            dispatch({
              type: "UPDATE_ASSISTANT_MESSAGE",
              payload: {
                nodeId,
                updates,
              },
            });
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
