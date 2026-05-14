import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import type { PatchEmitter } from "./patch-emitter";
import {
  extractFlushableCitationMarkdown,
  normalizeCitationTags,
} from "./citation";

export interface StreamBridgeOptions {
  emitter: PatchEmitter;
  responseMessageId: number;
  citationBuffering?: boolean;
  ensureResponseBlockOnFinish?: boolean;
  /** Called once before the first patch is emitted */
  onBeforeFirstPatch?: () => void | Promise<void>;
  onResponseBlock?: (blockIndex: number) => void | Promise<void>;
  onToolCall?: (
    blockIndex: number,
    toolName: string,
    toolCallId: string,
    args: unknown,
  ) => void | Promise<void>;
  onToolResult?: (
    blockIndex: number,
    toolCallId: string,
    result: unknown,
  ) => void | Promise<void>;
  onToolError?: (
    blockIndex: number,
    toolCallId: string,
    error: unknown,
  ) => void | Promise<void>;
  /** Transform tool output before emitting to SSE. Return value becomes the output field. */
  transformToolOutput?: (toolName: string, output: unknown) => unknown;
  /** Transform tool input before emitting to SSE. Return value becomes the input field. */
  transformToolInput?: (toolName: string, input: unknown) => unknown;
  onContentAppend?: (
    blockIndex: number,
    content: string,
    totalContent: string,
  ) => void | Promise<void>;
  onFinish?: (usage: LanguageModelUsage) => void | Promise<void>;
}

export async function bridgeAIStreamToPatches(
  fullStream: AsyncIterable<TextStreamPart<ToolSet> | Record<string, unknown>>,
  options: StreamBridgeOptions,
) {
  const {
    emitter,
    citationBuffering = true,
    ensureResponseBlockOnFinish = true,
  } = options;

  let citationBuffer = "";
  let totalContent = "";
  let nextBlockIndex = 0;
  let currentTextBlockIndex: number | null = null;
  const toolBlockIndexByCallId = new Map<string, number>();
  const toolNameByCallId = new Map<string, string>();
  let beforeFirstPatchCalled = false;

  const ensureBeforeFirstPatch = async () => {
    if (beforeFirstPatchCalled) return;
    beforeFirstPatchCalled = true;
    await options.onBeforeFirstPatch?.();
  };

  const ensureTextBlock = async () => {
    if (currentTextBlockIndex !== null) return currentTextBlockIndex;
    await ensureBeforeFirstPatch();
    const idx = nextBlockIndex++;
    currentTextBlockIndex = idx;
    await options.onResponseBlock?.(idx);
    emitter.sendPatch("add", "blocks", {
      type: "text",
      content: "",
      references: [],
    });
    return idx;
  };

  const flushContent = async (text: string) => {
    if (!text) return;
    const idx = await ensureTextBlock();
    totalContent += text;
    emitter.sendPatch("append", `blocks/${idx}/content`, text);
    await options.onContentAppend?.(idx, text, totalContent);
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
        currentTextBlockIndex = null;
        totalContent = "";

        await ensureBeforeFirstPatch();
        const idx = nextBlockIndex++;
        const toolCallId = String(part.toolCallId);
        const toolName = String(part.toolName);
        toolBlockIndexByCallId.set(toolCallId, idx);
        toolNameByCallId.set(toolCallId, toolName);
        await options.onToolCall?.(idx, toolName, toolCallId, part.input);

        const sseInput = options.transformToolInput
          ? options.transformToolInput(toolName, part.input)
          : [part.input];
        emitter.sendPatch("add", "blocks", {
          type: "tool_call",
          tool_name: toolName,
          tool_call_id: toolCallId,
          status: "WIP",
          input: sseInput,
          output: [],
        });
        break;
      }

      case "tool-result": {
        const toolCallId = String(part.toolCallId);
        const idx = toolBlockIndexByCallId.get(toolCallId);
        if (idx === undefined) break;

        const toolName = toolNameByCallId.get(toolCallId) ?? "";
        const rawOutput = part.output;
        const sseOutput = options.transformToolOutput
          ? options.transformToolOutput(toolName, rawOutput)
          : [rawOutput];
        emitter.sendPatch("set", `blocks/${idx}/output`, sseOutput);
        emitter.sendPatch("set", `blocks/${idx}/status`, "FINISHED");
        await options.onToolResult?.(idx, toolCallId, rawOutput);
        break;
      }

      case "tool-error": {
        const toolCallId = String(part.toolCallId);
        const idx = toolBlockIndexByCallId.get(toolCallId);
        if (idx === undefined) break;

        const toolName = toolNameByCallId.get(toolCallId) ?? "";
        const rawError = part.error;
        const sseOutput = options.transformToolOutput
          ? options.transformToolOutput(toolName, rawError)
          : [rawError];
        emitter.sendPatch("set", `blocks/${idx}/output`, sseOutput);
        emitter.sendPatch("set", `blocks/${idx}/status`, "FAILED");
        await options.onToolError?.(idx, toolCallId, rawError);
        break;
      }

      case "finish": {
        if (citationBuffer) {
          await flushContent(normalizeCitationTags(citationBuffer));
          citationBuffer = "";
        }
        if (ensureResponseBlockOnFinish && nextBlockIndex === 0) {
          await ensureTextBlock();
        }
        currentTextBlockIndex = null;
        await options.onFinish?.(part.totalUsage);
        break;
      }
    }
  }

  if (citationBuffer) {
    await flushContent(normalizeCitationTags(citationBuffer));
  }
}
