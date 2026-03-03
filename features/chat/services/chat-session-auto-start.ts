import type { Message } from "@/features/ai-sdk/hooks/use-chat/types";

export interface PendingChatAutoStart {
  chatId: string;
  model: string;
  seedMessages: Message[];
}

const pendingAutoStartByChatId = new Map<string, PendingChatAutoStart>();

export function setPendingChatAutoStart(value: PendingChatAutoStart): void {
  pendingAutoStartByChatId.set(value.chatId, value);
}

export function peekPendingChatAutoStart(
  chatId: string,
): PendingChatAutoStart | null {
  return pendingAutoStartByChatId.get(chatId) ?? null;
}

export function takePendingChatAutoStart(
  chatId: string,
): PendingChatAutoStart | null {
  const current = pendingAutoStartByChatId.get(chatId);
  if (!current) return null;
  pendingAutoStartByChatId.delete(chatId);
  return current;
}
