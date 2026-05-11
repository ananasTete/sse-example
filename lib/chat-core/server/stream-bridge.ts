import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";
import type { ChatPatchTarget } from "../types";
import type { PatchEmitter } from "./patch-emitter";
import {
  extractFlushableCitationMarkdown,
  normalizeCitationTags,
} from "./citation";

export interface StreamBridgeOptions {
  emitter: PatchEmitter;
  ensureResponseInitialized: () => void | Promise<void>;
  citationBuffering?: boolean;
  ensureResponseFragmentOnFinish?: boolean;
  onResponseFragment?: (fragmentId: number) => void | Promise<void>;
  onToolCall?: (
    fragmentId: number,
    toolName: string,
    toolCallId: string,
    args: unknown,
  ) => void | Promise<void>;
  onToolResult?: (
    fragmentId: number,
    toolCallId: string,
    result: unknown,
  ) => void | Promise<void>;
  onToolError?: (
    fragmentId: number,
    toolCallId: string,
    error: unknown,
  ) => void | Promise<void>;
  onContentAppend?: (
    fragmentId: number,
    content: string,
    totalContent: string,
  ) => void | Promise<void>;
  onFinish?: (usage: LanguageModelUsage) => void | Promise<void>;
}

function sendFragmentPatch(
  emitter: PatchEmitter,
  fragmentId: number,
  p: string,
  v: unknown,
  o: "APPEND" | "SET" = "SET",
) {
  emitter.sendPatch({
    t: { type: "fragment", id: fragmentId },
    p,
    o,
    v,
  });
}

export async function bridgeAIStreamToPatches(
  fullStream: AsyncIterable<TextStreamPart<ToolSet> | Record<string, unknown>>,
  options: StreamBridgeOptions,
) {
  const {
    emitter,
    citationBuffering = true,
    ensureResponseFragmentOnFinish = true,
  } = options;

  let citationBuffer = "";
  let totalContent = "";
  let nextFragmentId = 1;
  let currentResponseFragmentId: number | null = null;
  const toolFragmentIdByCallId = new Map<string, number>();

  await options.ensureResponseInitialized();

  const ensureResponseFragment = async () => {
    if (currentResponseFragmentId !== null) return currentResponseFragmentId;

    const fragmentId = nextFragmentId;
    nextFragmentId += 1;
    currentResponseFragmentId = fragmentId;
    await options.onResponseFragment?.(fragmentId);
    emitter.sendPatch({
      t: { type: "response" },
      p: "fragments",
      o: "APPEND",
      v: { id: fragmentId, type: "RESPONSE", content: "", references: [] },
    });
    return fragmentId;
  };

  const flushContent = async (text: string) => {
    if (!text) return;
    const fragmentId = await ensureResponseFragment();
    totalContent += text;
    sendFragmentPatch(emitter, fragmentId, "content", text, "APPEND");
    await options.onContentAppend?.(fragmentId, text, totalContent);
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
        currentResponseFragmentId = null;
        const fragmentId = nextFragmentId;
        nextFragmentId += 1;
        const toolCallId = String(part.toolCallId);
        const toolName = String(part.toolName);
        toolFragmentIdByCallId.set(toolCallId, fragmentId);
        await options.onToolCall?.(fragmentId, toolName, toolCallId, part.input);

        emitter.sendPatch({
          t: { type: "response" },
          p: "fragments",
          o: "APPEND",
          v: {
            id: fragmentId,
            type: "TOOL_CALL",
            tool_name: toolName,
            tool_call_id: toolCallId,
            status: "WIP",
            tool_input: part.input,
            tool_output: null,
          },
        });
        break;
      }

      case "tool-result": {
        const toolCallId = String(part.toolCallId);
        const fragmentId = toolFragmentIdByCallId.get(toolCallId);
        if (fragmentId === undefined) break;

        sendFragmentPatch(emitter, fragmentId, "tool_output", part.output);
        sendFragmentPatch(emitter, fragmentId, "status", "FINISHED");
        await options.onToolResult?.(fragmentId, toolCallId, part.output);
        break;
      }

      case "tool-error": {
        const toolCallId = String(part.toolCallId);
        const fragmentId = toolFragmentIdByCallId.get(toolCallId);
        if (fragmentId === undefined) break;

        sendFragmentPatch(emitter, fragmentId, "tool_output", part.error);
        sendFragmentPatch(emitter, fragmentId, "status", "FAILED");
        await options.onToolError?.(fragmentId, toolCallId, part.error);
        break;
      }

      case "finish": {
        if (citationBuffer) {
          await flushContent(normalizeCitationTags(citationBuffer));
          citationBuffer = "";
        }
        if (ensureResponseFragmentOnFinish && !totalContent) {
          await ensureResponseFragment();
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

export function responseTarget(): ChatPatchTarget {
  return { type: "response" };
}
