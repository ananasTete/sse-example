import { MessagePartV2 } from "../types";
import { isRecord } from "./transport";

interface RecordValue {
  [key: string]: unknown;
}

export interface ApplyAssistantEventInput {
  event: RecordValue;
  assistantNodeId: string;
  renameAssistantNode: (fromId: string, toId: string, model?: string) => void;
  updateAssistantMessage: (nodeId: string, updates: { model: string }) => void;
  updateAssistantParts: (
    updater: (parts: MessagePartV2[]) => MessagePartV2[],
  ) => void;
  setServerError: (error: Error) => void;
}

export const applyAssistantEvent = ({
  event,
  assistantNodeId,
  renameAssistantNode,
  updateAssistantMessage,
  updateAssistantParts,
  setServerError,
}: ApplyAssistantEventInput): string => {
  const eventType = event.type;
  if (typeof eventType !== "string") {
    return assistantNodeId;
  }

  switch (eventType) {
    case "start": {
      const nextId =
        typeof event.messageId === "string" ? event.messageId : undefined;
      const modelId =
        typeof event.modelId === "string" ? event.modelId : undefined;

      if (nextId && nextId !== assistantNodeId) {
        renameAssistantNode(assistantNodeId, nextId, modelId);
        return nextId;
      }

      if (modelId) {
        updateAssistantMessage(assistantNodeId, { model: modelId });
      }
      return assistantNodeId;
    }

    case "start-step":
      updateAssistantParts((parts) => [...parts, { type: "step-start" }]);
      return assistantNodeId;

    case "reasoning-start":
      updateAssistantParts((parts) => [
        ...parts,
        {
          type: "reasoning",
          text: "",
          state: "streaming",
        },
      ]);
      return assistantNodeId;

    case "reasoning-delta":
      if (event.delta) {
        const deltaText = String(event.delta);
        updateAssistantParts((parts) => {
          const lastReasoningIndex = parts.findLastIndex(
            (part) => part.type === "reasoning",
          );

          if (lastReasoningIndex === -1) {
            parts.push({
              type: "reasoning",
              text: deltaText,
              state: "streaming",
            });
            return parts;
          }

          const existingPart = parts[lastReasoningIndex];
          const existingText =
            existingPart.type === "reasoning" ? existingPart.text : "";

          parts[lastReasoningIndex] = {
            type: "reasoning",
            text: existingText + deltaText,
            state: "streaming",
          };

          return parts;
        });
      }
      return assistantNodeId;

    case "reasoning-end":
      updateAssistantParts((parts) => {
        const lastReasoningIndex = parts.findLastIndex(
          (part) => part.type === "reasoning",
        );

        if (lastReasoningIndex === -1) {
          return parts;
        }

        const existingPart = parts[lastReasoningIndex];
        const existingText =
          existingPart.type === "reasoning" ? existingPart.text : "";

        parts[lastReasoningIndex] = {
          type: "reasoning",
          text: existingText,
          state: "done",
        };

        return parts;
      });
      return assistantNodeId;

    case "text-start":
      updateAssistantParts((parts) => [
        ...parts,
        {
          type: "text",
          text: "",
          state: "streaming",
        },
      ]);
      return assistantNodeId;

    case "text-delta":
      if (event.delta) {
        const deltaText = String(event.delta);
        updateAssistantParts((parts) => {
          const lastTextIndex = parts.findLastIndex(
            (part) => part.type === "text",
          );

          if (lastTextIndex === -1) {
            parts.push({
              type: "text",
              text: deltaText,
              state: "streaming",
            });
            return parts;
          }

          const existingPart = parts[lastTextIndex];
          const existingText =
            existingPart.type === "text" ? existingPart.text : "";

          parts[lastTextIndex] = {
            type: "text",
            text: existingText + deltaText,
            state: "streaming",
          };

          return parts;
        });
      }
      return assistantNodeId;

    case "text-end":
      updateAssistantParts((parts) => {
        const lastTextIndex = parts.findLastIndex(
          (part) => part.type === "text",
        );

        if (lastTextIndex === -1) {
          return parts;
        }

        const existingPart = parts[lastTextIndex];
        const existingText =
          existingPart.type === "text" ? existingPart.text : "";

        parts[lastTextIndex] = {
          type: "text",
          text: existingText,
          state: "done",
        };

        return parts;
      });
      return assistantNodeId;

    case "finish-step":
    case "heartbeat":
      return assistantNodeId;

    case "finish":
      if (event.finishReason === "error") {
        const errorMessage =
          isRecord(event.error) && typeof event.error.message === "string"
            ? event.error.message
            : "Stream finished with error";
        setServerError(new Error(errorMessage));
      }
      return assistantNodeId;

    case "error": {
      const errorMessage =
        typeof event.message === "string"
          ? event.message
          : "Stream returned error event";
      setServerError(new Error(errorMessage));
      return assistantNodeId;
    }

    case "tool-input-start":
      if (
        typeof event.toolCallId !== "string" ||
        typeof event.toolName !== "string"
      ) {
        return assistantNodeId;
      }
      updateAssistantParts((parts) => [
        ...parts,
        {
          type: "tool-call",
          toolCallId: String(event.toolCallId),
          toolName: String(event.toolName),
          state: "streaming-input",
          inputText: "",
        },
      ]);
      return assistantNodeId;

    case "tool-input-delta":
      if (typeof event.toolCallId !== "string") return assistantNodeId;
      updateAssistantParts((parts) => {
        const toolCallIndex = parts.findLastIndex(
          (part) =>
            part.type === "tool-call" && part.toolCallId === event.toolCallId,
        );

        if (toolCallIndex !== -1) {
          const toolPart = parts[toolCallIndex];
          if (toolPart.type === "tool-call") {
            parts[toolCallIndex] = {
              ...toolPart,
              inputText:
                (toolPart.inputText || "") + String(event.inputTextDelta ?? ""),
            };
          }
        }

        return parts;
      });
      return assistantNodeId;

    case "tool-input-available":
      if (typeof event.toolCallId !== "string") return assistantNodeId;
      updateAssistantParts((parts) => {
        const toolCallIndex = parts.findLastIndex(
          (part) =>
            part.type === "tool-call" && part.toolCallId === event.toolCallId,
        );

        if (toolCallIndex !== -1) {
          const toolPart = parts[toolCallIndex];
          if (toolPart.type === "tool-call") {
            parts[toolCallIndex] = {
              ...toolPart,
              state: "input-available",
              input: isRecord(event.input) ? event.input : undefined,
            };
          }
        }

        return parts;
      });
      return assistantNodeId;

    case "tool-output-available":
      if (typeof event.toolCallId !== "string") return assistantNodeId;
      updateAssistantParts((parts) => {
        const toolCallIndex = parts.findLastIndex(
          (part) =>
            part.type === "tool-call" && part.toolCallId === event.toolCallId,
        );

        if (toolCallIndex !== -1) {
          const toolPart = parts[toolCallIndex];
          if (toolPart.type === "tool-call") {
            parts[toolCallIndex] = {
              ...toolPart,
              state: "output-available",
              output: event.output,
            };
          }
        }

        return parts;
      });
      return assistantNodeId;

    default:
      return assistantNodeId;
  }
};
