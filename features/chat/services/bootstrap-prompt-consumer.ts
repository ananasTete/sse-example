const consumedBootstrapPromptTokens = new Set<string>();

export function consumeBootstrapPromptToken(token: string): boolean {
  const normalizedToken = token.trim();
  if (!normalizedToken) return false;

  if (consumedBootstrapPromptTokens.has(normalizedToken)) {
    return false;
  }

  consumedBootstrapPromptTokens.add(normalizedToken);
  return true;
}
