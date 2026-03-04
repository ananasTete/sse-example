import { consumeRunStreamAttempt } from "../run-stream";
import {
  MAX_STREAM_RESUME_ATTEMPTS,
  STREAM_RESUME_BASE_DELAY_MS,
  STREAM_RESUME_MAX_DELAY_MS,
  generateRuntimeId,
  isAbortLikeError,
  wait,
} from "../runtime";
import type { RunIdentityV2, StreamAttemptResult } from "../runtime";
import type { ConnectRunStreamWithRecoveryInput } from "./types";

interface SessionState {
  run: RunIdentityV2;
  assistantNodeId: string;
  attempt: number;
  finalDisconnect: boolean;
}

type AttemptAction = "retry" | "done";

const getAssistantPartsLength = (
  mapping: Record<string, { message?: { parts?: unknown[] } }>,
  assistantNodeId: string,
) => mapping[assistantNodeId]?.message?.parts?.length ?? 0;

const finalizeSuccess = (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  assistantNodeId: string,
) => {
  input.refs.activeRunRef.current = null;
  input.clearAppliedSeq(state.run.id);
  input.emitFinish(assistantNodeId, {
    isAbort: false,
    isDisconnect: false,
    isError: false,
  });
};

const reconcileAfterCompletedAttempt = async (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
) => {
  const recoveredAfterComplete = await input.recoverChatDetailFromServer({
    applyConversation: true,
  });
  if (recoveredAfterComplete) {
    state.assistantNodeId =
      recoveredAfterComplete.activeRun?.assistantMessageId ?? state.assistantNodeId;
  }

  const completedPartsLength = getAssistantPartsLength(
    input.refs.conversationRef.current.mapping,
    state.assistantNodeId,
  );
  if (completedPartsLength > 0) return;

  const recovered = await input.recoverChatDetailFromServer({
    applyConversation: true,
  });
  if (!recovered) return;

  const recoveredAssistantId =
    recovered.activeRun?.assistantMessageId ?? state.assistantNodeId;
  const recoveredPartsLength = getAssistantPartsLength(
    recovered.conversation.mapping,
    recoveredAssistantId,
  );

  if (recoveredPartsLength > 0) {
    state.assistantNodeId = recoveredAssistantId;
    input.dispatch({
      type: "FINALIZE_STREAMING",
      payload: { assistantNodeId: state.assistantNodeId },
    });
  }
};

const handleCompletedAttempt = async (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  result: StreamAttemptResult,
  attemptNo: number,
) => {
  console.info("Run stream completed", {
    chatId: input.chatId,
    runId: state.run.id,
    attempt: attemptNo,
    lastSeq: result.lastSeq,
  });

  // Always reconcile with server snapshot on completion.
  // It guarantees convergence if duplicate frames were consumed locally.
  await reconcileAfterCompletedAttempt(input, state);
  finalizeSuccess(input, state, state.assistantNodeId);
};

const handleAbortedAttempt = (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  result: StreamAttemptResult,
  controller: AbortController,
  attemptNo: number,
) => {
  const abortReason = result.abortReason ?? input.getAbortReason(controller.signal);
  console.info("Run stream aborted", {
    chatId: input.chatId,
    runId: state.run.id,
    attempt: attemptNo,
    afterSeq: result.lastSeq,
    reason: abortReason,
  });

  input.dispatch({
    type: "ABORT_STREAMING",
    payload: { assistantNodeId: state.assistantNodeId },
  });
};

const scheduleResumeAttempt = async (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  recoveredRun: RunIdentityV2,
) => {
  state.attempt += 1;
  state.run = recoveredRun;
  state.assistantNodeId = recoveredRun.assistantMessageId;
  input.refs.activeRunRef.current = recoveredRun;
  input.refs.streamingAssistantNodeIdRef.current = state.assistantNodeId;
  input.setAppliedSeq(recoveredRun.id, recoveredRun.lastPersistedSeq);

  const backoffMs = Math.min(
    STREAM_RESUME_BASE_DELAY_MS * 2 ** (state.attempt - 1),
    STREAM_RESUME_MAX_DELAY_MS,
  );

  console.info("Run stream resume scheduled", {
    chatId: input.chatId,
    runId: recoveredRun.id,
    nextAttempt: state.attempt + 1,
    backoffMs,
    resumeAfterSeq: recoveredRun.lastPersistedSeq,
  });

  await wait(backoffMs);
};

const handleFailedAttempt = async (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  result: StreamAttemptResult,
  attemptNo: number,
): Promise<AttemptAction> => {
  const runError = result.error ?? new Error("Run stream failed");
  state.finalDisconnect = result.kind === "disconnected";

  console.warn("Run stream attempt failed", {
    chatId: input.chatId,
    runId: state.run.id,
    attempt: attemptNo,
    kind: result.kind,
    afterSeq: result.lastSeq,
    error: runError.message,
  });

  const recovered = await input.recoverChatDetailFromServer({
    applyConversation: true,
  });
  if (!recovered) {
    throw runError;
  }

  const recoveredRun = recovered.activeRun;
  if (
    recoveredRun &&
    recoveredRun.status === "running" &&
    recovered.conversation.mapping[recoveredRun.assistantMessageId] &&
    state.attempt < MAX_STREAM_RESUME_ATTEMPTS
  ) {
    await scheduleResumeAttempt(input, state, recoveredRun);
    return "retry";
  }

  const fallbackAssistantNodeId =
    recoveredRun?.assistantMessageId ?? state.assistantNodeId;
  const fallbackPartsLength = getAssistantPartsLength(
    recovered.conversation.mapping,
    fallbackAssistantNodeId,
  );

  if (fallbackPartsLength > 0) {
    input.dispatch({
      type: "FINALIZE_STREAMING",
      payload: { assistantNodeId: fallbackAssistantNodeId },
    });

    finalizeSuccess(input, state, fallbackAssistantNodeId);
    return "done";
  }

  throw runError;
};

const handleSessionCatch = async (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  controller: AbortController,
  err: unknown,
) => {
  const currentAssistantId =
    input.refs.streamingAssistantNodeIdRef.current ?? state.assistantNodeId;

  if (controller.signal.aborted || isAbortLikeError(err)) {
    console.info("Run stream aborted in catch", {
      chatId: input.chatId,
      runId: state.run.id,
      attempt: state.attempt + 1,
      afterSeq: input.getAppliedSeq(state.run.id) ?? 0,
      reason: input.getAbortReason(controller.signal),
    });

    input.dispatch({
      type: "ABORT_STREAMING",
      payload: { assistantNodeId: currentAssistantId },
    });
    return;
  }

  const errorObj = err instanceof Error ? err : new Error(String(err));

  console.warn("Run stream failed irrecoverably", {
    chatId: input.chatId,
    runId: state.run.id,
    attempt: state.attempt + 1,
    afterSeq: input.getAppliedSeq(state.run.id) ?? 0,
    error: errorObj.message,
  });

  input.dispatch({
    type: "ABORT_STREAMING",
    payload: { assistantNodeId: currentAssistantId },
  });

  input.dispatch({ type: "SET_ERROR", payload: errorObj });
  input.onError?.(errorObj);

  await input.recoverChatDetailFromServer({
    applyConversation: true,
  });

  input.emitFinish(currentAssistantId, {
    isAbort: false,
    isDisconnect: state.finalDisconnect,
    isError: true,
  });
};

const cleanupSessionRefs = (
  input: ConnectRunStreamWithRecoveryInput,
  streamOwnerId: string,
) => {
  if (input.refs.streamOwnerRef.current === streamOwnerId) {
    input.refs.streamAbortControllerRef.current = null;
    input.refs.streamAbortReasonRef.current = null;
    input.refs.streamingAssistantNodeIdRef.current = null;
    input.refs.activeRunRef.current = null;
    input.refs.streamOwnerRef.current = null;
  }
};

const createSessionState = (
  input: ConnectRunStreamWithRecoveryInput,
  streamOwnerId: string,
  controller: AbortController,
): SessionState => {
  input.refs.streamOwnerRef.current = streamOwnerId;
  input.refs.streamAbortReasonRef.current = null;
  input.refs.streamAbortControllerRef.current = controller;
  input.refs.streamingAssistantNodeIdRef.current = input.initialAssistantNodeId;
  input.refs.activeRunRef.current = input.initialRunIdentity;
  input.setAppliedSeq(
    input.initialRunIdentity.id,
    input.initialRunIdentity.lastPersistedSeq,
  );

  return {
    run: input.initialRunIdentity,
    assistantNodeId: input.initialAssistantNodeId,
    attempt: 0,
    finalDisconnect: false,
  };
};

const consumeSingleAttempt = async (
  input: ConnectRunStreamWithRecoveryInput,
  state: SessionState,
  controller: AbortController,
) => {
  const attemptNo = state.attempt + 1;
  const streamAfterSeq = Math.max(
    0,
    input.getAppliedSeq(state.run.id) ?? state.run.lastPersistedSeq,
  );

  console.info("Run stream attempt start", {
    chatId: input.chatId,
    runId: state.run.id,
    attempt: attemptNo,
    afterSeq: streamAfterSeq,
  });

  const assistantSnapshot =
    input.refs.conversationRef.current.mapping[state.assistantNodeId]?.message;
  const hasLocalAssistantState = Boolean(
    assistantSnapshot?.parts && assistantSnapshot.parts.length > 0,
  );

  const result = await consumeRunStreamAttempt({
    api: input.api,
    chatId: input.chatId,
    headers: input.headers,
    runIdentity: state.run,
    assistantNodeId: state.assistantNodeId,
    controller,
    dispatch: input.dispatch,
    onData: input.onData,
    hasLocalAssistantState,
    getAppliedSeq: input.getAppliedSeq,
    setAppliedSeq: input.setAppliedSeq,
    clearAppliedSeq: input.clearAppliedSeq,
    getAbortReason: input.getAbortReason,
  });
  state.assistantNodeId = result.assistantNodeId;

  if (result.kind === "completed") {
    await handleCompletedAttempt(input, state, result, attemptNo);
    return "done" as const;
  }

  if (result.kind === "aborted") {
    handleAbortedAttempt(input, state, result, controller, attemptNo);
    return "done" as const;
  }

  return handleFailedAttempt(input, state, result, attemptNo);
};

export const connectToRunStreamWithRecovery = async (
  input: ConnectRunStreamWithRecoveryInput,
) => {
  if (input.refs.streamAbortControllerRef.current) {
    input.abortActiveStream("replace-stream-connection");
  }

  const controller = new AbortController();
  const streamOwnerId = generateRuntimeId();
  const state = createSessionState(input, streamOwnerId, controller);

  try {
    while (!controller.signal.aborted) {
      const action = await consumeSingleAttempt(input, state, controller);
      if (action === "done") {
        return;
      }
    }
  } catch (err) {
    await handleSessionCatch(input, state, controller, err);
  } finally {
    cleanupSessionRefs(input, streamOwnerId);
  }
};
