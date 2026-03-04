import { nanoid } from "nanoid";
import {
  ActiveChatRunV2,
  ConversationNode,
  ConversationStateV2,
} from "./types";

export const MAX_STREAM_RESUME_ATTEMPTS = 4;
export const STREAM_RESUME_BASE_DELAY_MS = 320;
export const STREAM_RESUME_MAX_DELAY_MS = 2200;
const MAX_SHARED_APPLIED_SEQ_ENTRIES = 2048;

const sharedAppliedSeqByRun = new Map<string, number>();

export const generateRuntimeId = () => nanoid();

export const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const toNonNegativeInt = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.floor(numeric);
};

const getSharedAppliedSeq = (runId: string): number => {
  const value = sharedAppliedSeqByRun.get(runId);
  return value === undefined ? 0 : value;
};

const setSharedAppliedSeq = (runId: string, seq: number): number => {
  const normalized = toNonNegativeInt(seq);
  const current = getSharedAppliedSeq(runId);
  const next = Math.max(current, normalized);
  sharedAppliedSeqByRun.set(runId, next);

  if (sharedAppliedSeqByRun.size > MAX_SHARED_APPLIED_SEQ_ENTRIES) {
    const oldestRunId = sharedAppliedSeqByRun.keys().next().value;
    if (typeof oldestRunId === "string") {
      sharedAppliedSeqByRun.delete(oldestRunId);
    }
  }

  return next;
};

export const getAppliedSeqForRun = (
  localMap: Map<string, number>,
  runId: string,
) => {
  const localSeq = localMap.get(runId) ?? 0;
  const sharedSeq = getSharedAppliedSeq(runId);
  return Math.max(localSeq, sharedSeq);
};

export const setAppliedSeqForRun = (
  localMap: Map<string, number>,
  runId: string,
  seq: number,
) => {
  const nextSeq = setSharedAppliedSeq(runId, seq);
  localMap.set(runId, nextSeq);
  return nextSeq;
};

export const clearAppliedSeqForRun = (
  localMap: Map<string, number>,
  runId: string,
) => {
  localMap.delete(runId);
};

export interface CreateChatRunResponse {
  run_id: string;
  assistant_message_id: string;
  resume_token: string;
  last_seq: number;
  last_persisted_seq: number;
  status: "running" | "done" | "aborted" | "error";
  status_reason: string | null;
  last_error?: string | null;
  last_heartbeat_at?: string | null;
}

export interface RecoveryActiveRunPayload {
  id: string;
  assistant_message_id: string;
  resume_token: string;
  last_seq: number;
  last_persisted_seq: number;
  status: "running" | "done" | "aborted" | "error";
  status_reason: string | null;
  last_error?: string | null;
  last_heartbeat_at?: string | null;
  created_at: string;
}

export interface RunIdentityV2 {
  id: string;
  assistantMessageId: string;
  resumeToken: string;
  lastSeq: number;
  lastPersistedSeq: number;
  status: "running" | "done" | "aborted" | "error";
  statusReason: string | null;
  lastError: string | null;
  lastHeartbeatAt: string | null;
}

export interface RecoveryChatDetailResponse {
  conversation: {
    rootId: string;
    current_leaf_message_id: string;
    mapping: ConversationStateV2["mapping"];
  };
  active_run?: RecoveryActiveRunPayload;
}

export interface RecoverySnapshot {
  conversation: ConversationStateV2;
  activeRun: RunIdentityV2 | null;
}

export type StreamAbortReason =
  | "hook-unmount"
  | "replace-stream-connection"
  | "manual-stop"
  | "unknown";

export interface StreamAttemptResult {
  kind: "completed" | "aborted" | "disconnected" | "failed";
  assistantNodeId: string;
  lastSeq: number;
  abortReason?: StreamAbortReason;
  error?: Error;
}

export const isStreamAbortReason = (
  value: unknown,
): value is StreamAbortReason =>
  value === "hook-unmount" ||
  value === "replace-stream-connection" ||
  value === "manual-stop" ||
  value === "unknown";

export const isAbortLikeError = (value: unknown): boolean => {
  if (isStreamAbortReason(value)) return true;
  return value instanceof Error && value.name === "AbortError";
};

export const toRunIdentity = (
  input: ActiveChatRunV2 | CreateChatRunResponse | RecoveryActiveRunPayload,
): RunIdentityV2 => {
  if ("run_id" in input) {
    return {
      id: input.run_id,
      assistantMessageId: input.assistant_message_id,
      resumeToken: input.resume_token,
      lastSeq: toNonNegativeInt(input.last_seq),
      lastPersistedSeq: toNonNegativeInt(input.last_persisted_seq),
      status: input.status,
      statusReason: input.status_reason,
      lastError: input.last_error ?? input.status_reason,
      lastHeartbeatAt: input.last_heartbeat_at ?? null,
    };
  }

  if ("assistant_message_id" in input) {
    return {
      id: input.id,
      assistantMessageId: input.assistant_message_id,
      resumeToken: input.resume_token,
      lastSeq: toNonNegativeInt(input.last_seq),
      lastPersistedSeq: toNonNegativeInt(input.last_persisted_seq),
      status: input.status,
      statusReason: input.status_reason,
      lastError: input.last_error ?? input.status_reason,
      lastHeartbeatAt: input.last_heartbeat_at ?? null,
    };
  }

  return {
    id: input.id,
    assistantMessageId: input.assistantMessageId,
    resumeToken: input.resumeToken,
    lastSeq: toNonNegativeInt(input.lastSeq),
    lastPersistedSeq: toNonNegativeInt(
      input.lastPersistedSeq,
      toNonNegativeInt(input.lastSeq),
    ),
    status: input.status,
    statusReason: input.statusReason ?? null,
    lastError: input.lastError ?? null,
    lastHeartbeatAt: input.lastHeartbeatAt ?? null,
  };
};

export const createUserNode = (
  chatId: string,
  text: string,
  parentId: string,
): ConversationNode => {
  const now = new Date().toISOString();
  const id = generateRuntimeId();

  return {
    id,
    parentId,
    childIds: [],
    role: "user",
    visible: true,
    message: {
      id,
      chatId,
      role: "user",
      createdAt: now,
      parts: [{ type: "text", text, state: "done" }],
    },
  };
};

export const createAssistantPlaceholderNode = (
  chatId: string,
  parentId: string,
  model: string,
): ConversationNode => {
  const now = new Date().toISOString();
  const id = generateRuntimeId();

  return {
    id,
    parentId,
    childIds: [],
    role: "assistant",
    visible: true,
    message: {
      id,
      chatId,
      role: "assistant",
      createdAt: now,
      model,
      parts: [],
    },
  };
};

export const hasStreamingAssistantParts = (conversation: ConversationStateV2): boolean => {
  for (const node of Object.values(conversation.mapping)) {
    if (node.role !== "assistant" || !node.message) continue;

    for (const part of node.message.parts) {
      if ((part.type === "text" || part.type === "reasoning") && part.state === "streaming") {
        return true;
      }
      if (part.type === "tool-call" && part.state === "streaming-input") {
        return true;
      }
    }
  }

  return false;
};
