import type {
  ChatCompletionOptions,
  ChatMessage,
  ChatStreamPatchContext,
} from "../types";
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

  // 把 HTTP 响应的二进制流先通过 TextDecoderStream 转成文本流。
  // 并自动处理 UTF-8 字符跨 chunk 被切开的情况。比如一个中文字符的字节被拆到两次 read() 里，TextDecoderStream 会缓存残缺字节，等完整后再输出正确字符串。
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // 把文本块交给 eventsource-parser 解析，他会自动处理一个 SSE 消息被切开的情况，等待完整消息拼接完整才输出。
    parser.feed(value);

    if (streamError) {
      throw streamError;
    }
  }

  if (streamError) {
    throw streamError;
  }
}
