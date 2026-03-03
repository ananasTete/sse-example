export interface PendingChatAutoStart {
  chatId: string;
  model: string;
}

const pendingAutoStartByChatId = new Map<string, PendingChatAutoStart>();

export function setPendingChatAutoStart(value: PendingChatAutoStart): void {
  pendingAutoStartByChatId.set(value.chatId, value);
}

export function takePendingChatAutoStart(
  chatId: string,
): PendingChatAutoStart | null {
  const current = pendingAutoStartByChatId.get(chatId);
  if (!current) return null;
  pendingAutoStartByChatId.delete(chatId);
  return current;
}
