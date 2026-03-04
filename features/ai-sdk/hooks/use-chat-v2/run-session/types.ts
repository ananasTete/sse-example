import type { Dispatch, MutableRefObject } from "react";
import type { ChatActionV2 } from "../reducer";
import type { ConversationStateV2, OnDataCallbackV2, OnErrorCallbackV2 } from "../types";
import type { RecoverySnapshot, RunIdentityV2, StreamAbortReason } from "../runtime";

export interface RunStreamFinishFlags {
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

export interface RecoverChatDetailOptions {
  applyConversation?: boolean;
}

export interface RecoverChatDetailInput {
  api: string;
  chatId: string;
  headers: Record<string, string>;
  dispatch: Dispatch<ChatActionV2>;
  setAppliedSeq: (runId: string, seq: number) => void;
  options?: RecoverChatDetailOptions;
}

export interface RunSessionRefs {
  conversationRef: MutableRefObject<ConversationStateV2>;
  streamAbortControllerRef: MutableRefObject<AbortController | null>;
  streamOwnerRef: MutableRefObject<string | null>;
  streamAbortReasonRef: MutableRefObject<StreamAbortReason | null>;
  streamingAssistantNodeIdRef: MutableRefObject<string | null>;
  activeRunRef: MutableRefObject<RunIdentityV2 | null>;
}

export interface ConnectRunStreamWithRecoveryInput {
  api: string;
  chatId: string;
  headers: Record<string, string>;
  dispatch: Dispatch<ChatActionV2>;
  refs: RunSessionRefs;
  initialRunIdentity: RunIdentityV2;
  initialAssistantNodeId: string;
  onData?: OnDataCallbackV2;
  onError?: OnErrorCallbackV2;
  abortActiveStream: (reason: Exclude<StreamAbortReason, "unknown">) => void;
  getAbortReason: (signal?: AbortSignal) => StreamAbortReason;
  getAppliedSeq: (runId: string) => number;
  setAppliedSeq: (runId: string, seq: number) => void;
  clearAppliedSeq: (runId: string) => void;
  recoverChatDetailFromServer: (
    options?: RecoverChatDetailOptions,
  ) => Promise<RecoverySnapshot | null>;
  emitFinish: (assistantNodeId: string, flags: RunStreamFinishFlags) => void;
}
