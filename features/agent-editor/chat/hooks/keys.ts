export const agentChatKeys = {
  all: ["agent-editor-chat"] as const,
  sessions: () => [...agentChatKeys.all, "sessions"] as const,
  draftSession: () => [...agentChatKeys.all, "draft-session"] as const,
  session: (chatSessionId: string) =>
    [...agentChatKeys.all, "session", chatSessionId] as const,
};
