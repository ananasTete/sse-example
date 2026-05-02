export const chatKeys = {
  all: ["session-chat"] as const,
  sessions: () => [...chatKeys.all, "sessions"] as const,
  draftSession: (scope: string) =>
    [...chatKeys.all, "draft-session", scope] as const,
  session: (chatSessionId: string) =>
    [...chatKeys.all, "session", chatSessionId] as const,
};
