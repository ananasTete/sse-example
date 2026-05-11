import type {
  ChatCompletionOptions,
  ChatMessage,
  ChatStreamPatchContext,
} from "../types";
import { consumePatchStream } from "@/lib/chat-core/client/stream-consumer";
import {
  createChatCompletionParser,
  type ChatCompletionStreamCallbacks,
  type ChatStateUpdater,
} from "./parser";

export function getChatMessageText(message: ChatMessage) {
  const targetType = message.role === "USER" ? "REQUEST" : "RESPONSE";
  return message.fragments
    .filter((fragment) => fragment.type === targetType)
    .map((fragment) => fragment.content ?? "")
    .join("");
}

export async function processChatCompletionStream({
  response,
  options,
  updateState,
  onReady,
  onSessionPatch,
  onTitle,
}: {
  response: Response;
  options: ChatCompletionOptions;
  updateState: ChatStateUpdater;
} & ChatCompletionStreamCallbacks) {
  if (!response.body) return;

  // 用于记录上次消息的操作用于本次消息
  const patchContext: ChatStreamPatchContext = {
    responseMessageId: null,
    responseMessageIndex: null,
    lastTarget: null,
    lastPath: null,
    lastOperation: null,
  };
  let streamError: Error | null = null;

  const parser = createChatCompletionParser({
    options,
    updateState,
    patchContext,
    onReady,
    onSessionPatch,
    onTitle,
    onError: (error) => {
      streamError = error;
    },
  });

  await consumePatchStream(response, parser);

  if (streamError) {
    throw streamError;
  }
}
