import { consumePatchStream } from "@/lib/chat-core/client/stream-consumer";
import type { AgentChatMessage, PatchContext } from "../types";
import {
  createAgentChatCompletionParser,
  type AgentChatCompletionStreamCallbacks,
  type AgentChatStateUpdater,
} from "./parser";

export function getAgentChatMessageText(message: AgentChatMessage) {
  return message.blocks
    .filter((block) => block.type === "text")
    .map((block) => ("content" in block ? (block.content ?? "") : ""))
    .join("");
}

export async function processAgentChatCompletionStream({
  response,
  updateState,
  onReady,
  onSessionPatch,
  onTitle,
  onDone,
}: {
  response: Response;
  updateState: AgentChatStateUpdater;
} & AgentChatCompletionStreamCallbacks) {
  if (!response.body) return;

  const patchContext: PatchContext = {
    lastOp: null,
    lastPath: null,
  };
  let streamError: Error | null = null;

  const parser = createAgentChatCompletionParser({
    updateState,
    patchContext,
    onReady,
    onSessionPatch,
    onTitle,
    onDone,
    onError: (error) => {
      streamError = error;
    },
  });

  await consumePatchStream(response, parser);

  if (streamError) {
    throw streamError;
  }
}
