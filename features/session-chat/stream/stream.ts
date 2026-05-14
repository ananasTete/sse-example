import type { ChatMessage, PatchContext } from "../types";
import { consumePatchStream } from "@/lib/chat-core/client/stream-consumer";
import {
  createChatCompletionParser,
  type ChatCompletionStreamCallbacks,
  type ChatStateUpdater,
} from "./parser";

export function getChatMessageText(message: ChatMessage) {
  return message.blocks
    .filter((block) => block.type === "text")
    .map((block) => ("content" in block ? (block.content ?? "") : ""))
    .join("");
}

export async function processChatCompletionStream({
  response,
  updateState,
  onReady,
  onSessionPatch,
  onTitle,
  onDone,
}: {
  response: Response;
  updateState: ChatStateUpdater;
} & ChatCompletionStreamCallbacks) {
  if (!response.body) return;

  const patchContext: PatchContext = {
    lastOp: null,
    lastPath: null,
  };
  let streamError: Error | null = null;

  const parser = createChatCompletionParser({
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
