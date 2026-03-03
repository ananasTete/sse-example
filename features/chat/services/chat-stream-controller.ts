type StopStreamFn = () => void;

let activeChatId: string | null = null;
let stopActiveStreamFn: StopStreamFn | null = null;

export function registerActiveChatStreamController(
  chatId: string,
  stop: StopStreamFn,
): () => void {
  activeChatId = chatId;
  stopActiveStreamFn = stop;

  return () => {
    if (activeChatId !== chatId) return;
    activeChatId = null;
    stopActiveStreamFn = null;
  };
}

export function stopActiveChatStream(): void {
  stopActiveStreamFn?.();
}
