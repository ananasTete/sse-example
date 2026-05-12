import type { ChatCompletionOptions, ChatMessage } from "../types";

const toEpochSeconds = () => Date.now() / 1000;

export function createUserMessage(
  messageId: number,
  options: ChatCompletionOptions,
): ChatMessage {
  return {
    message_id: messageId,
    parent_id: options.parentMessageId,
    model: "",
    role: "USER",
    thinking_enabled: options.thinkingEnabled,
    ban_edit: false,
    ban_regenerate: false,
    status: "FINISHED",
    incomplete_message: null,
    accumulated_token_usage: options.prompt.length,
    feedback: null,
    inserted_at: toEpochSeconds(),
    search_enabled: options.searchEnabled,
    blocks: [
      {
        id: messageId,
        type: "request",
        content: options.prompt,
      },
    ],
    has_pending_block: false,
    auto_continue: false,
  };
}

export function upsertMessage(messages: ChatMessage[], message: ChatMessage) {
  const existingIndex = messages.findIndex(
    (item) => item.message_id === message.message_id,
  );

  if (existingIndex >= 0) {
    messages[existingIndex] = message;
    return;
  }

  messages.push(message);
  messages.sort((a, b) => a.message_id - b.message_id);
}
