import { createParser, EventSourceParser } from "eventsource-parser";
import type { Dispatch } from "react";
import { ChatActionV2 } from "./reducer";
import { MessagePartV2, OnDataCallbackV2 } from "./types";

export interface ParserContextV2 {
  assistantNodeId: string;
  dispatch: Dispatch<ChatActionV2>;
  onData?: OnDataCallbackV2;
}

export interface ParserResultV2 {
  parser: EventSourceParser;
  getServerError: () => Error | null;
  getAssistantNodeId: () => string;
}

export function createSSEParserV2(context: ParserContextV2): ParserResultV2 {
  const { dispatch, onData } = context;
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
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const eventType = parsed.type as string;

        onData?.(data);

        switch (eventType) {
          case "start": {
            const nextId = typeof parsed.messageId === "string" ? parsed.messageId : undefined;
            const modelId = typeof parsed.modelId === "string" ? parsed.modelId : undefined;

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
            if (parsed.delta) {
              currentReasoningText += String(parsed.delta);
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
            if (parsed.delta) {
              currentTextContent += String(parsed.delta);
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
            if (parsed.finishReason === "error") {
              serverError = new Error(
                parsed.error?.message || "Stream finished with error",
              );
            }
            break;

          case "tool-input-start":
            updateAssistantParts((parts) => [
              ...parts,
              {
                type: "tool-call",
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                state: "streaming-input",
                inputText: "",
              },
            ]);
            break;

          case "tool-input-delta":
            updateAssistantParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === parsed.toolCallId,
              );

              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    inputText: (toolPart.inputText || "") + parsed.inputTextDelta,
                  };
                }
              }

              return parts;
            });
            break;

          case "tool-input-available":
            updateAssistantParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === parsed.toolCallId,
              );

              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    state: "input-available",
                    input: parsed.input,
                  };
                }
              }

              return parts;
            });
            break;

          case "tool-output-available":
            updateAssistantParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (part) =>
                  part.type === "tool-call" &&
                  part.toolCallId === parsed.toolCallId,
              );

              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    state: "output-available",
                    output: parsed.output,
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
