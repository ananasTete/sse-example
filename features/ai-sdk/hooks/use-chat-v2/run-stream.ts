import type { Dispatch } from "react";
import { createSSEParserV2 } from "./parser";
import type { ChatActionV2 } from "./reducer";
import type { OnDataCallbackV2 } from "./types";
import {
  RunIdentityV2,
  StreamAbortReason,
  StreamAttemptResult,
  isAbortLikeError,
  toNonNegativeInt,
} from "./runtime";

interface ConsumeRunStreamAttemptInput {
  api: string;
  chatId: string;
  headers: Record<string, string>;
  runIdentity: RunIdentityV2;
  assistantNodeId: string;
  controller: AbortController;
  dispatch: Dispatch<ChatActionV2>;
  onData?: OnDataCallbackV2;
  hasLocalAssistantState: boolean;
  getAppliedSeq: (runId: string) => number;
  setAppliedSeq: (runId: string, seq: number) => void;
  clearAppliedSeq: (runId: string) => void;
  getAbortReason: (signal?: AbortSignal) => StreamAbortReason;
}

export const consumeRunStreamAttempt = async ({
  api,
  chatId,
  headers,
  runIdentity,
  assistantNodeId,
  controller,
  dispatch,
  onData,
  hasLocalAssistantState,
  getAppliedSeq,
  setAppliedSeq,
  clearAppliedSeq,
  getAbortReason,
}: ConsumeRunStreamAttemptInput): Promise<StreamAttemptResult> => {
  const knownAppliedSeq = getAppliedSeq(runIdentity.id);
  const serverPersistedSeq = toNonNegativeInt(runIdentity.lastPersistedSeq);

  let lastSeq = hasLocalAssistantState
    ? Math.max(knownAppliedSeq ?? 0, serverPersistedSeq)
    : 0;

  if (!hasLocalAssistantState) {
    clearAppliedSeq(runIdentity.id);
  }

  try {
    const query = new URLSearchParams({
      afterSeq: String(lastSeq),
      resumeToken: runIdentity.resumeToken,
    });

    const response = await fetch(
      `${api}/${chatId}/runs/${runIdentity.id}/stream?${query.toString()}`,
      {
        method: "GET",
        headers,
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Failed to connect run stream (${response.status}): ${bodyText || response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("No response body");
    }

    dispatch({ type: "SET_STREAMING" });

    let sequenceGapError: Error | null = null;
    const { parser, getServerError, getAssistantNodeId } = createSSEParserV2({
      assistantNodeId,
      dispatch,
      onData,
      onSseFrame: ({ id }) => {
        if (!id) return true;

        const seq = Number(id);
        if (!Number.isFinite(seq)) return true;

        const nextSeq = Math.floor(seq);
        const appliedSeq = getAppliedSeq(runIdentity.id) ?? 0;
        if (nextSeq <= appliedSeq) {
          return false;
        }

        const baselineSeq = Math.max(lastSeq, appliedSeq);
        if (baselineSeq > 0 && nextSeq > baselineSeq + 1) {
          sequenceGapError = new Error(
            `Run stream sequence gap: expected ${baselineSeq + 1}, got ${nextSeq}`,
          );
        }

        lastSeq = nextSeq;
        setAppliedSeq(runIdentity.id, nextSeq);
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
          assistantNodeId,
          lastSeq,
          abortReason: getAbortReason(controller.signal),
        };
      }

      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (readError) {
        if (controller.signal.aborted) {
          return {
            kind: "aborted",
            assistantNodeId,
            lastSeq,
            abortReason: getAbortReason(controller.signal),
          };
        }

        return {
          kind: "disconnected",
          assistantNodeId,
          lastSeq,
          error: readError instanceof Error ? readError : new Error(String(readError)),
        };
      }

      const { done, value } = readResult;
      if (done) break;

      parser.feed(decoder.decode(value, { stream: true }));
      if (sequenceGapError) {
        throw sequenceGapError;
      }

      const serverError = getServerError();
      if (serverError) {
        throw serverError;
      }
    }

    const finalAssistantNodeId = getAssistantNodeId();
    setAppliedSeq(runIdentity.id, lastSeq);

    dispatch({
      type: "FINALIZE_STREAMING",
      payload: { assistantNodeId: finalAssistantNodeId },
    });

    return {
      kind: "completed",
      assistantNodeId: finalAssistantNodeId,
      lastSeq,
    };
  } catch (err) {
    if (controller.signal.aborted || isAbortLikeError(err)) {
      return {
        kind: "aborted",
        assistantNodeId,
        lastSeq,
        abortReason: getAbortReason(controller.signal),
      };
    }

    return {
      kind: "failed",
      assistantNodeId,
      lastSeq,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
};
