import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import type { Target } from "../types";
import type { MutationEmitter } from "./mutation-emitter";
import {
  extractFlushableCitationMarkdown,
  normalizeCitationTags,
} from "./citation";

export interface StreamBridgeOptions {
  emitter: MutationEmitter;
  responseMessageId: string | number;
  ensureResponseInitialized: () => void | Promise<void>;
  citationBuffering?: boolean;
  ensureResponseBlockOnFinish?: boolean;
  onResponseBlock?: (blockId: number) => void | Promise<void>;
  onToolCall?: (
    blockId: number,
    toolName: string,
    toolCallId: string,
    args: unknown,
  ) => void | Promise<void>;
  onToolResult?: (
    blockId: number,
    toolCallId: string,
    result: unknown,
  ) => void | Promise<void>;
  onToolError?: (
    blockId: number,
    toolCallId: string,
    error: unknown,
  ) => void | Promise<void>;
  onContentAppend?: (
    blockId: number,
    content: string,
    totalContent: string,
  ) => void | Promise<void>;
  onFinish?: (usage: LanguageModelUsage) => void | Promise<void>;
}

function sendBlockPatch(
  emitter: MutationEmitter,
  responseMessageId: string | number,
  blockId: number,
  p: string,
  v: unknown,
  o: "append" | "set" = "set",
) {
  emitter.sendMutation({
    target: {
      type: "block",
      id: blockId,
      parent: { type: "message", id: responseMessageId },
    },
    path: p,
    op: o,
    value: v,
  });
}

export async function bridgeAIStreamToPatches(
  fullStream: AsyncIterable<TextStreamPart<ToolSet> | Record<string, unknown>>,
  options: StreamBridgeOptions,
) {
  const {
    emitter,
    responseMessageId,
    citationBuffering = true,
    ensureResponseBlockOnFinish = true,
  } = options;

  let citationBuffer = "";
  let totalContent = "";
  let nextBlockId = 1;
  let currentResponseBlockId: number | null = null;
  const toolBlockIdByCallId = new Map<string, number>();

  await options.ensureResponseInitialized();

  const ensureResponseBlock = async () => {
    if (currentResponseBlockId !== null) return currentResponseBlockId;

    const blockId = nextBlockId;
    nextBlockId += 1;
    currentResponseBlockId = blockId;
    await options.onResponseBlock?.(blockId);
    emitter.sendMutation({
      target: { type: "message", id: responseMessageId },
      path: "blocks",
      op: "append",
      value: { id: blockId, type: "response", content: "", references: [] },
    });
    return blockId;
  };

  const flushContent = async (text: string) => {
    if (!text) return;
    const blockId = await ensureResponseBlock();
    totalContent += text;
    sendBlockPatch(
      emitter,
      responseMessageId,
      blockId,
      "content",
      text,
      "append",
    );
    await options.onContentAppend?.(blockId, text, totalContent);
  };

  for await (const part of fullStream) {
    switch (part.type) {
      case "text-delta": {
        const text = typeof part.text === "string" ? part.text : "";
        if (citationBuffering) {
          citationBuffer += text;
          const { flush, hold } =
            extractFlushableCitationMarkdown(citationBuffer);
          citationBuffer = hold;
          await flushContent(flush);
        } else {
          await flushContent(text);
        }
        break;
      }

      case "tool-call": {
        currentResponseBlockId = null;
        const blockId = nextBlockId;
        nextBlockId += 1;
        const toolCallId = String(part.toolCallId);
        const toolName = String(part.toolName);
        toolBlockIdByCallId.set(toolCallId, blockId);
        await options.onToolCall?.(blockId, toolName, toolCallId, part.input);

        emitter.sendMutation({
          target: { type: "message", id: responseMessageId },
          path: "blocks",
          op: "append",
          value: {
            id: blockId,
            type: "tool_call",
            tool_name: toolName,
            tool_call_id: toolCallId,
            status: "WIP",
            input: part.input,
            output: null,
          },
        });
        break;
      }

      case "tool-result": {
        const toolCallId = String(part.toolCallId);
        const blockId = toolBlockIdByCallId.get(toolCallId);
        if (blockId === undefined) break;

        sendBlockPatch(
          emitter,
          responseMessageId,
          blockId,
          "output",
          part.output,
        );
        sendBlockPatch(
          emitter,
          responseMessageId,
          blockId,
          "status",
          "FINISHED",
        );
        await options.onToolResult?.(blockId, toolCallId, part.output);
        break;
      }

      case "tool-error": {
        const toolCallId = String(part.toolCallId);
        const blockId = toolBlockIdByCallId.get(toolCallId);
        if (blockId === undefined) break;

        sendBlockPatch(
          emitter,
          responseMessageId,
          blockId,
          "output",
          part.error,
        );
        sendBlockPatch(
          emitter,
          responseMessageId,
          blockId,
          "status",
          "FAILED",
        );
        await options.onToolError?.(blockId, toolCallId, part.error);
        break;
      }

      case "finish": {
        if (citationBuffer) {
          await flushContent(normalizeCitationTags(citationBuffer));
          citationBuffer = "";
        }
        if (ensureResponseBlockOnFinish && !totalContent) {
          await ensureResponseBlock();
        }
        await options.onFinish?.(part.totalUsage);
        break;
      }
    }
  }

  if (citationBuffer) {
    await flushContent(normalizeCitationTags(citationBuffer));
  }
}

export function responseTarget(messageId: string | number): Target {
  return { type: "message", id: messageId };
}
