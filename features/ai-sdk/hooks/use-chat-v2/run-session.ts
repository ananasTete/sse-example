import { hasStreamingAssistantParts } from "./runtime";
import type { RunIdentityV2 } from "./runtime";
import type { ConversationStateV2 } from "./types";

export { connectToRunStreamWithRecovery } from "./run-session/connect";
export { recoverChatDetailSnapshotFromServer } from "./run-session/recover";
export type {
  ConnectRunStreamWithRecoveryInput,
  RecoverChatDetailOptions,
  RecoverChatDetailInput,
  RunSessionRefs,
  RunStreamFinishFlags,
} from "./run-session/types";

export const shouldAttemptSnapshotRecovery = (
  conversation: ConversationStateV2,
  activeRunStatus?: RunIdentityV2["status"],
) => activeRunStatus !== "running" && hasStreamingAssistantParts(conversation);
