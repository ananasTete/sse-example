export interface ChatBootstrapPrompt {
  token: string;
  text: string;
}

export interface ChatNavigationState {
  bootstrapPrompt?: ChatBootstrapPrompt;
}

export const EMPTY_CHAT_NAVIGATION_STATE: ChatNavigationState = {};

function isChatBootstrapPrompt(value: unknown): value is ChatBootstrapPrompt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatBootstrapPrompt>;
  return (
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0
  );
}

export function getBootstrapPromptFromLocationState(
  value: unknown,
): ChatBootstrapPrompt | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as ChatNavigationState).bootstrapPrompt;
  if (!isChatBootstrapPrompt(candidate)) return null;

  return {
    token: candidate.token,
    text: candidate.text.trim(),
  };
}
