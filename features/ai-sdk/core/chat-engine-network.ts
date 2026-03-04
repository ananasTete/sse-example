import {
  isAbortLikeError,
  RunIdentityV2,
  StreamAbortReason,
  StreamAttemptResult,
  toNonNegativeInt,
  MAX_STREAM_RESUME_ATTEMPTS,
  STREAM_RESUME_BASE_DELAY_MS,
  STREAM_RESUME_MAX_DELAY_MS,
  wait,
  RecoverySnapshot,
  generateRuntimeId,
  getAppliedSeqForRun,
  setAppliedSeqForRun,
  clearAppliedSeqForRun,
  isStreamAbortReason,
} from "../hooks/use-chat-v2/runtime";
import {
  OnDataCallbackV2,
  OnErrorCallbackV2,
} from "../hooks/use-chat-v2/types";
import { ChatEngineState } from "./chat-engine-state";
import { createEngineSSEParser } from "./chat-engine-parser";
import { RunStreamFinishFlags } from "../hooks/use-chat-v2/types";

export interface ChatNetworkManagerOptions {
  api: string;
  chatId: string;
  model: string;
  headers: Record<string, string>;
  engineState: ChatEngineState;

  onData?: OnDataCallbackV2;
  onError?: OnErrorCallbackV2;
  onFinish?: (assistantNodeId: string, flags: RunStreamFinishFlags) => void;
  recoverChatDetailFromServer: (options?: {
    applyConversation?: boolean;
  }) => Promise<RecoverySnapshot | null>;
}

export class ChatNetworkManager {
  private api: string;
  private chatId: string;
  private model: string;
  private headers: Record<string, string>;

  private engineState: ChatEngineState;

  private onData?: OnDataCallbackV2;
  private onError?: OnErrorCallbackV2;
  private onFinish?: (
    assistantNodeId: string,
    flags: RunStreamFinishFlags,
  ) => void;
  public recoverChatDetailFromServer: (options?: {
    applyConversation?: boolean;
  }) => Promise<RecoverySnapshot | null>;

  private runAppliedSeqMap = new Map<string, number>();
  public activeRun: RunIdentityV2 | null = null;
  public streamingAssistantNodeId: string | null = null;

  private streamController: AbortController | null = null;
  private streamOwner: string | null = null;
  private streamAbortReason: StreamAbortReason | null = null;

  constructor(options: ChatNetworkManagerOptions) {
    this.api = options.api;
    this.chatId = options.chatId;
    this.model = options.model;
    this.headers = options.headers;
    this.engineState = options.engineState;
    this.onData = options.onData;
    this.onError = options.onError;
    this.onFinish = options.onFinish;
    this.recoverChatDetailFromServer = options.recoverChatDetailFromServer;
  }

  // --- Network State Tracking ---

  private getAppliedSeq(runId: string) {
    return getAppliedSeqForRun(this.runAppliedSeqMap, runId);
  }

  private setAppliedSeq(runId: string, seq: number) {
    setAppliedSeqForRun(this.runAppliedSeqMap, runId, seq);
  }

  public clearAppliedSeq(runId: string) {
    clearAppliedSeqForRun(this.runAppliedSeqMap, runId);
  }

  private getAbortReason(signal?: AbortSignal): StreamAbortReason {
    const signalReason = (
      signal as (AbortSignal & { reason?: unknown }) | undefined
    )?.reason;
    if (isStreamAbortReason(signalReason)) {
      return signalReason;
    }
    return this.streamAbortReason ?? "unknown";
  }

  public abortActiveStream(reason: string) {
    const controller = this.streamController;
    if (!controller) return;

    this.streamAbortReason = reason as StreamAbortReason;
    console.info("Abort run stream", {
      chatId: this.chatId,
      runId: this.activeRun?.id ?? null,
      reason,
    });

    if (!controller.signal.aborted) {
      (
        controller as AbortController & { abort: (reason?: unknown) => void }
      ).abort(reason);
    }

    this.streamController = null;

    if (reason === "hook-unmount") {
      this.activeRun = null;
    }
  }

  private async consumeSingleAttempt(
    run: RunIdentityV2,
    assistantNodeId: string,
    controller: AbortController,
    attempt: number,
  ): Promise<StreamAttemptResult> {
    const streamAfterSeq = Math.max(
      0,
      this.getAppliedSeq(run.id) ?? run.lastPersistedSeq,
    );

    console.info("Run stream attempt start", {
      chatId: this.chatId,
      runId: run.id,
      attempt,
      afterSeq: streamAfterSeq,
    });

    const assistantSnapshot =
      this.engineState.conversation.mapping[assistantNodeId]?.message;
    const hasLocalAssistantState = Boolean(
      assistantSnapshot?.parts && assistantSnapshot.parts.length > 0,
    );

    let lastSeq = hasLocalAssistantState
      ? Math.max(streamAfterSeq, toNonNegativeInt(run.lastPersistedSeq))
      : 0;
    if (!hasLocalAssistantState) {
      this.clearAppliedSeq(run.id);
    }

    try {
      const query = new URLSearchParams({
        afterSeq: String(lastSeq),
        resumeToken: run.resumeToken,
      });

      const response = await fetch(
        `${this.api}/${this.chatId}/runs/${run.id}/stream?${query.toString()}`,
        {
          method: "GET",
          headers: this.headers,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(
          `Failed to connect run stream (${response.status}): ${bodyText || response.statusText}`,
        );
      }
      if (!response.body) throw new Error("No response body");

      this.engineState.setStreaming();

      let sequenceGapError: Error | null = null;
      const latestAssistantNodeId = assistantNodeId;

      const { parser, getServerError, getAssistantNodeId } =
        createEngineSSEParser({
          assistantNodeId: latestAssistantNodeId,
          engineState: this.engineState,
          onData: this.onData,
          onSseFrame: ({ id }) => {
            if (!id) return true;
            const seq = Number(id);
            if (!Number.isFinite(seq)) return true;

            const nextSeq = Math.floor(seq);
            const appliedSeq = this.getAppliedSeq(run.id) ?? 0;
            if (nextSeq <= appliedSeq) return false;

            const baselineSeq = Math.max(lastSeq, appliedSeq);
            if (baselineSeq > 0 && nextSeq > baselineSeq + 1) {
              sequenceGapError = new Error(
                `Run stream sequence gap: expected ${baselineSeq + 1}, got ${nextSeq}`,
              );
            }

            lastSeq = nextSeq;
            this.setAppliedSeq(run.id, nextSeq);
            return true;
          },
        });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (controller.signal.aborted) {
          await reader.cancel();
          return {
            kind: "aborted",
            assistantNodeId: getAssistantNodeId(),
            lastSeq,
            abortReason: this.getAbortReason(controller.signal),
          };
        }

        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (readError) {
          if (controller.signal.aborted) {
            return {
              kind: "aborted",
              assistantNodeId: getAssistantNodeId(),
              lastSeq,
              abortReason: this.getAbortReason(controller.signal),
            };
          }
          return {
            kind: "disconnected",
            assistantNodeId: getAssistantNodeId(),
            lastSeq,
            error:
              readError instanceof Error
                ? readError
                : new Error(String(readError)),
          };
        }

        const { done, value } = readResult;
        if (done) break;

        parser.feed(decoder.decode(value, { stream: true }));
        if (sequenceGapError) throw sequenceGapError;
        if (getServerError()) throw getServerError();
      }

      this.setAppliedSeq(run.id, lastSeq);
      this.engineState.finalizeStreaming(getAssistantNodeId());

      return {
        kind: "completed",
        assistantNodeId: getAssistantNodeId(),
        lastSeq,
      };
    } catch (err) {
      if (controller.signal.aborted || isAbortLikeError(err)) {
        return {
          kind: "aborted",
          assistantNodeId,
          lastSeq,
          abortReason: this.getAbortReason(controller.signal),
        };
      }
      return {
        kind: "failed",
        assistantNodeId,
        lastSeq,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  private getAssistantPartsLength(nodeId: string) {
    return (
      this.engineState.conversation.mapping[nodeId]?.message?.parts?.length ?? 0
    );
  }

  public async connectToStreamAsync(
    runIdentity: RunIdentityV2,
    initialAssistantNodeId: string,
  ) {
    const controller = new AbortController();
    const streamOwnerId = generateRuntimeId();

    this.streamOwner = streamOwnerId;
    this.streamController = controller;
    this.streamingAssistantNodeId = initialAssistantNodeId;
    this.activeRun = runIdentity;
    this.setAppliedSeq(runIdentity.id, runIdentity.lastPersistedSeq);

    const state = {
      run: runIdentity,
      assistantNodeId: initialAssistantNodeId,
      attempt: 0,
      finalDisconnect: false,
    };

    try {
      while (!controller.signal.aborted) {
        state.attempt++;
        const attemptNo = state.attempt;
        const result = await this.consumeSingleAttempt(
          state.run,
          state.assistantNodeId,
          controller,
          attemptNo,
        );

        state.assistantNodeId = result.assistantNodeId;

        if (result.kind === "completed") {
          console.info("Run stream completed", {
            chatId: this.chatId,
            runId: state.run.id,
            attempt: attemptNo,
            lastSeq: result.lastSeq,
          });

          let recovered = await this.recoverChatDetailFromServer({
            applyConversation: true,
          });
          if (recovered) {
            state.assistantNodeId =
              recovered.activeRun?.assistantMessageId ?? state.assistantNodeId;
          }

          if (this.getAssistantPartsLength(state.assistantNodeId) === 0) {
            recovered = await this.recoverChatDetailFromServer({
              applyConversation: true,
            });
            if (
              recovered &&
              this.getAssistantPartsLength(
                recovered.activeRun?.assistantMessageId ??
                  state.assistantNodeId,
              ) > 0
            ) {
              state.assistantNodeId =
                recovered.activeRun?.assistantMessageId ??
                state.assistantNodeId;
              this.engineState.finalizeStreaming(state.assistantNodeId);
            }
          }

          this.activeRun = null;
          this.clearAppliedSeq(state.run.id);
          this.onFinish?.(state.assistantNodeId, {
            isAbort: false,
            isDisconnect: false,
            isError: false,
          });
          break;
        }

        if (result.kind === "aborted") {
          const abortReason =
            result.abortReason ?? this.getAbortReason(controller.signal);
          console.info("Run stream aborted", {
            chatId: this.chatId,
            runId: state.run.id,
            attempt: attemptNo,
            reason: abortReason,
          });
          if (
            abortReason !== "hook-unmount" &&
            abortReason !== "replace-stream-connection"
          ) {
            this.engineState.abortStreaming(state.assistantNodeId);
          }
          break;
        }

        const runError = result.error ?? new Error("Run stream failed");
        state.finalDisconnect = result.kind === "disconnected";

        console.warn("Run stream attempt failed", {
          chatId: this.chatId,
          runId: state.run.id,
          attempt: attemptNo,
          kind: result.kind,
          error: runError.message,
        });

        const recovered = await this.recoverChatDetailFromServer({
          applyConversation: true,
        });
        if (!recovered) throw runError;

        const recoveredRun = recovered.activeRun;
        if (
          recoveredRun &&
          recoveredRun.status === "running" &&
          recovered.conversation.mapping[recoveredRun.assistantMessageId] &&
          state.attempt < MAX_STREAM_RESUME_ATTEMPTS
        ) {
          state.run = recoveredRun;
          state.assistantNodeId = recoveredRun.assistantMessageId;
          this.activeRun = recoveredRun;
          this.streamingAssistantNodeId = recoveredRun.assistantMessageId;
          this.setAppliedSeq(recoveredRun.id, recoveredRun.lastPersistedSeq);

          const backoffMs = Math.min(
            STREAM_RESUME_BASE_DELAY_MS * 2 ** (state.attempt - 1),
            STREAM_RESUME_MAX_DELAY_MS,
          );
          console.info("Run stream resume scheduled", {
            chatId: this.chatId,
            runId: recoveredRun.id,
            nextAttempt: state.attempt + 1,
            backoffMs,
          });
          await wait(backoffMs);
          continue; // retry loop
        }

        const fallbackId =
          recoveredRun?.assistantMessageId ?? state.assistantNodeId;
        if (this.getAssistantPartsLength(fallbackId) > 0) {
          this.engineState.finalizeStreaming(fallbackId);
          this.activeRun = null;
          this.clearAppliedSeq(state.run.id);
          this.onFinish?.(fallbackId, {
            isAbort: false,
            isDisconnect: false,
            isError: false,
          });
          break;
        }

        throw runError;
      }
    } catch (err) {
      if (controller.signal.aborted || isAbortLikeError(err)) {
        const abortReason = this.getAbortReason(controller.signal);
        if (
          abortReason !== "hook-unmount" &&
          abortReason !== "replace-stream-connection"
        ) {
          this.engineState.abortStreaming(
            this.streamingAssistantNodeId ?? state.assistantNodeId,
          );
        }
      } else {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        console.warn("Run stream failed irrecoverably", errorObj.message);
        this.engineState.abortStreaming(
          this.streamingAssistantNodeId ?? state.assistantNodeId,
        );
        this.engineState.setError(errorObj);
        this.onError?.(errorObj);
        await this.recoverChatDetailFromServer({ applyConversation: true });
        this.onFinish?.(
          this.streamingAssistantNodeId ?? state.assistantNodeId,
          {
            isAbort: false,
            isDisconnect: state.finalDisconnect,
            isError: true,
          },
        );
      }
    } finally {
      if (this.streamOwner === streamOwnerId) {
        this.streamController = null;
        this.streamAbortReason = null;
        this.streamingAssistantNodeId = null;
        this.activeRun = null;
        this.streamOwner = null;
      }
    }
  }

  public cancelActiveRun() {
    const currentActiveRun = this.activeRun;
    if (!currentActiveRun) return;

    this.activeRun = null;
    this.clearAppliedSeq(currentActiveRun.id);

    fetch(`${this.api}/${this.chatId}/runs/${currentActiveRun.id}/cancel`, {
      method: "POST",
      headers: this.headers,
    }).catch((cancelError) => {
      console.warn("Failed to cancel active run", cancelError);
    });
  }
}
