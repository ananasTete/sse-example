import { createParser, EventSourceParser } from "eventsource-parser";
import type { Dispatch } from "react";
import { ChatActionV2 } from "./reducer";
import { MessagePartV2, OnDataCallbackV2 } from "./types";

interface RecordValue {
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null;

const normalizeTransportPayload = (
  transportEvent: string | undefined,
  parsed: unknown,
): unknown => {
  if (transportEvent === "delta" && isRecord(parsed)) {
    const op = parsed.o;
    const value = parsed.v;

    if (op === "add" && isRecord(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      let appendedText: string | null = null;
      let hasFinished = false;
      let finishReason = "stop";

      for (const item of value) {
        if (!isRecord(item)) continue;
        const path = typeof item.p === "string" ? item.p : "";
        const operation = typeof item.o === "string" ? item.o : "";
        const patchValue = item.v;

        if (
          path === "/message/content/parts/0" &&
          operation === "append" &&
          typeof patchValue === "string"
        ) {
          appendedText = (appendedText ?? "") + patchValue;
        }

        if (
          path === "/message/status" &&
          operation === "replace" &&
          patchValue === "finished_successfully"
        ) {
          hasFinished = true;
        }

        if (
          path === "/message/metadata" &&
          operation === "append" &&
          isRecord(patchValue) &&
          isRecord(patchValue.finish_details) &&
          typeof patchValue.finish_details.type === "string"
        ) {
          finishReason = patchValue.finish_details.type;
        }
      }

      if (appendedText) {
        return {
          type: "text-delta",
          delta: appendedText,
        };
      }

      if (hasFinished) {
        return {
          type: "finish",
          finishReason,
        };
      }
    }
  }

  if (isRecord(parsed) && isRecord(parsed.v) && typeof parsed.v.type === "string") {
    return parsed.v;
  }

  return parsed;
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
  onSseFrame?: (meta: SseFrameMetaV2) => void;
}

export interface ParserResultV2 {
  parser: EventSourceParser;
  getServerError: () => Error | null;
  getAssistantNodeId: () => string;
}

export function createSSEParserV2(context: ParserContextV2): ParserResultV2 {
  const { dispatch, onData, onSseFrame } = context;
  let assistantNodeId = context.assistantNodeId;

  let currentReasoningText = "";
  let currentTextContent = "";
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
      onSseFrame?.({
        id: event.id || undefined,
        event: event.event || undefined,
        data,
      });
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const normalized = normalizeTransportPayload(event.event, parsed);
        if (!isRecord(normalized)) {
          return;
        }
        const eventType = normalized.type as string;

        onData?.(data);

        switch (eventType) {
          case "start": {
            const nextId =
              typeof normalized.messageId === "string"
                ? normalized.messageId
                : undefined;
            const modelId =
              typeof normalized.modelId === "string"
                ? normalized.modelId
                : undefined;

            if (nextId && nextId !== assistantNodeId) {
              dispatch({
                type: "RENAME_ASSISTANT_NODE",
                payload: {
                  fromId: assistantNodeId,
                  toId: nextId,
                  ...(modelId ? { model: modelId } : {}),
                },
              });
              assistantNodeId = nextId;
              break;
            }

            if (modelId) {
              dispatch({
                type: "UPDATE_ASSISTANT_MESSAGE",
                payload: {
                  nodeId: assistantNodeId,
                  updates: { model: modelId },
                },
              });
            }
            break;
          }

          case "start-step":
            updateAssistantParts((parts) => [...parts, { type: "step-start" }]);
            break;

          case "reasoning-start":
            currentReasoningText = "";
            updateAssistantParts((parts) => [
              ...parts,
              {
                type: "reasoning",
                text: "",
                state: "streaming",
              },
            ]);
            break;

          case "reasoning-delta":
            if (normalized.delta) {
              currentReasoningText += String(normalized.delta);
              updateAssistantParts((parts) => {
                const lastReasoningIndex = parts.findLastIndex(
                  (part) => part.type === "reasoning",
                );

                if (lastReasoningIndex !== -1) {
                  parts[lastReasoningIndex] = {
                    type: "reasoning",
                    text: currentReasoningText,
                    state: "streaming",
                  };
                }

                return parts;
              });
            }
            break;

          case "reasoning-end":
            updateAssistantParts((parts) => {
              const lastReasoningIndex = parts.findLastIndex(
                (part) => part.type === "reasoning",
              );

              if (lastReasoningIndex !== -1) {
                parts[lastReasoningIndex] = {
                  type: "reasoning",
                  text: currentReasoningText,
                  state: "done",
                };
              }

              return parts;
            });
            break;

          case "text-start":
            currentTextContent = "";
            updateAssistantParts((parts) => [
              ...parts,
              {
                type: "text",
                text: "",
                state: "streaming",
              },
            ]);
            break;

          case "text-delta":
            if (normalized.delta) {
              currentTextContent += String(normalized.delta);
              updateAssistantParts((parts) => {
                const lastTextIndex = parts.findLastIndex(
                  (part) => part.type === "text",
                );

                if (lastTextIndex !== -1) {
                  parts[lastTextIndex] = {
                    type: "text",
                    text: currentTextContent,
                    state: "streaming",
                  };
                }

                return parts;
              });
            }
            break;

          case "text-end":
            updateAssistantParts((parts) => {
              const lastTextIndex = parts.findLastIndex(
                (part) => part.type === "text",
              );

              if (lastTextIndex !== -1) {
                parts[lastTextIndex] = {
                  type: "text",
                  text: currentTextContent,
                  state: "done",
                };
              }

              return parts;
            });
            break;

          case "finish-step":
            break;

          case "finish":
            if (normalized.finishReason === "error") {
              const errorMessage =
                isRecord(normalized.error) &&
                typeof normalized.error.message === "string"
                  ? normalized.error.message
                  : "Stream finished with error";
              serverError = new Error(
                errorMessage,
              );
            }
            break;

          case "tool-input-start":
            if (
              typeof normalized.toolCallId !== "string" ||
              typeof normalized.toolName !== "string"
            ) {
              break;
            }
            updateAssistantParts((parts) => [
              ...parts,
              {
                type: "tool-call",
                toolCallId: normalized.toolCallId,
                toolName: normalized.toolName,
                state: "streaming-input",
                inputText: "",
              },
            ]);
            break;

          case "tool-input-delta":
            if (typeof normalized.toolCallId !== "string") break;
            updateAssistantParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === normalized.toolCallId,
              );

              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    inputText:
                      (toolPart.inputText || "") +
                      String(normalized.inputTextDelta ?? ""),
                  };
                }
              }

              return parts;
            });
            break;

          case "tool-input-available":
            if (typeof normalized.toolCallId !== "string") break;
            updateAssistantParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === normalized.toolCallId,
              );

              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    state: "input-available",
                    input: isRecord(normalized.input)
                      ? normalized.input
                      : undefined,
                  };
                }
              }

              return parts;
            });
            break;

          case "tool-output-available":
            if (typeof normalized.toolCallId !== "string") break;
            updateAssistantParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === normalized.toolCallId,
              );

              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    state: "output-available",
                    output: normalized.output,
                  };
                }
              }

              return parts;
            });
            break;

          default:
            break;
        }
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
