import { createParser, EventSourceParser } from "eventsource-parser";
import { Message, MessagePart, OnDataCallback } from "./types";
import { ChatAction } from "./reducer";

export interface ParserContext {
  aiMessageId: string;
  aiMessage: Message;
  dispatch: React.Dispatch<ChatAction>;
  onData?: OnDataCallback;
}

export interface ParserResult {
  parser: EventSourceParser;
  getServerError: () => Error | null;
  getAiMessageId: () => string;
}

/**
 * 创建 SSE 事件解析器
 * 处理各种流式事件类型并更新消息状态
 */
export function createSSEParser(context: ParserContext): ParserResult {
  const { aiMessage, dispatch, onData } = context;
  let aiMessageId = context.aiMessageId;

  // 用于追踪当前的 reasoning 和 text 内容
  let currentReasoningText = "";
  let currentTextContent = "";
  let serverError: Error | null = null;

  // 辅助函数：更新 AI 消息的 parts
  const updateAiMessageParts = (
    updater: (parts: MessagePart[]) => MessagePart[]
  ) => {
    dispatch({
      type: "UPDATE_AI_PARTS",
      payload: { messageId: aiMessageId, updater },
    });
  };

  const parser = createParser({
    onEvent: (event) => {
      const data = event.data;
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const eventType = parsed.type as string;

        // 调用 onData 回调，传入原始数据
        onData?.(data);

        switch (eventType) {
          case "start":
            // 服务器分配的消息 ID，可选择覆盖本地 ID
            if (parsed.messageId || parsed.modelId) {
              if (parsed.messageId) {
                aiMessageId = parsed.messageId;
              }
              dispatch({
                type: "UPDATE_AI_MESSAGE",
                payload: {
                  messageId: aiMessage.id,
                  updates: {
                    ...(parsed.messageId ? { id: parsed.messageId } : {}),
                    ...(parsed.modelId ? { model: parsed.modelId } : {}),
                  },
                },
              });
            }
            break;

          case "start-step":
            // 步骤开始，可添加 step-start part
            updateAiMessageParts((parts) => [
              ...parts,
              { type: "step-start" },
            ]);
            break;

          case "reasoning-start":
            currentReasoningText = "";
            updateAiMessageParts((parts) => [
              ...parts,
              { type: "reasoning", text: "", state: "streaming" },
            ]);
            break;

          case "reasoning-delta":
            if (parsed.delta) {
              currentReasoningText += parsed.delta;
              updateAiMessageParts((parts) => {
                // 找到最后一个 reasoning part 并更新
                const lastReasoningIndex = parts.findLastIndex(
                  (p) => p.type === "reasoning"
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
            updateAiMessageParts((parts) => {
              const lastReasoningIndex = parts.findLastIndex(
                (p) => p.type === "reasoning"
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
            updateAiMessageParts((parts) => [
              ...parts,
              { type: "text", text: "", state: "streaming" },
            ]);
            break;

          case "text-delta":
            if (parsed.delta) {
              currentTextContent += parsed.delta;
              updateAiMessageParts((parts) => {
                // 找到最后一个 text part 并更新
                const lastTextIndex = parts.findLastIndex(
                  (p) => p.type === "text"
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
            updateAiMessageParts((parts) => {
              const lastTextIndex = parts.findLastIndex(
                (p) => p.type === "text"
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
            // 步骤结束，当前暂不做特殊处理
            break;

          case "finish":
            // 完成，可记录 finishReason
            if (parsed.finishReason === "error") {
              serverError = new Error(
                parsed.error?.message || "Stream finished with error"
              );
            }
            break;

          // === 工具调用事件 ===
          case "tool-input-start":
            // 工具调用开始，创建新的 tool-call part
            updateAiMessageParts((parts) => [
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
            // 工具参数增量更新
            updateAiMessageParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (p) =>
                  p.type === "tool-call" &&
                  p.toolCallId === parsed.toolCallId
              );
              if (toolCallIndex !== -1) {
                const toolPart = parts[toolCallIndex];
                if (toolPart.type === "tool-call") {
                  parts[toolCallIndex] = {
                    ...toolPart,
                    inputText:
                      (toolPart.inputText || "") + parsed.inputTextDelta,
                  };
                }
              }
              return parts;
            });
            break;

          case "tool-input-available":
            // 工具参数完整可用，开始执行
            updateAiMessageParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (p) =>
                  p.type === "tool-call" &&
                  p.toolCallId === parsed.toolCallId
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
            // 工具执行结果可用
            updateAiMessageParts((parts) => {
              const toolCallIndex = parts.findLastIndex(
                (p) =>
                  p.type === "tool-call" &&
                  p.toolCallId === parsed.toolCallId
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
            // 未知事件类型，忽略
            break;
        }
      } catch {
        // 解析失败时忽略（可能是非 JSON 数据）
      }
    },
  });

  return {
    parser,
    getServerError: () => serverError,
    getAiMessageId: () => aiMessageId,
  };
}
