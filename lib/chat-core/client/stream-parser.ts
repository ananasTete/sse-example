import { createParser, type EventSourceMessage } from "eventsource-parser";
import { produce } from "immer";
import type { PatchOp, PatchContext, ReadyPayload, SessionPayload, DonePayload, ErrorPayload, BatchItem } from "../types";
import { applyPathPatch } from "./patch-apply";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPatchOp = (value: unknown): value is PatchOp =>
  value === "add" || value === "append" || value === "set" || value === "batch";

export interface PatchStreamParserOptions<TState> {
  /** Apply state update (immer-based) */
  updateState: (updater: (state: TState | undefined) => TState | undefined) => void;
  /** Handle ready event */
  onReady?: (data: ReadyPayload) => void;
  /** Handle upsert_message — client must replace message state with this snapshot */
  onUpsertMessage?: (message: Record<string, unknown>) => void;
  /** Handle session update */
  onSession?: (data: SessionPayload) => void;
  /** Handle done event */
  onDone?: (data: DonePayload) => void;
  /** Handle error event */
  onError?: (data: ErrorPayload) => void;
  /** Handle parse errors */
  onParseError?: (error: Error) => void;
  /** Resolve the message object from state to apply patches to */
  resolveMessage: (state: TState) => unknown | null;
  /** Patch context for sticky compression */
  patchContext: PatchContext;
}

export function createPatchStreamParser<TState>(
  options: PatchStreamParserOptions<TState>,
) {
  return createParser({
    onEvent: (event: EventSourceMessage) => {
      if (!event.data) return;

      try {
        const data = JSON.parse(event.data) as unknown;
        if (!isRecord(data)) return;

        // Named events
        if (event.event) {
          switch (event.event) {
            case "ready":
              options.onReady?.(data as unknown as ReadyPayload);
              break;
            case "upsert_message":
              options.onUpsertMessage?.(data);
              break;
            case "update_session":
              options.onSession?.(data as unknown as SessionPayload);
              break;
            case "done":
              options.onDone?.(data as unknown as DonePayload);
              break;
            case "error":
              options.onError?.(data as unknown as ErrorPayload);
              break;
          }
          return;
        }

        // Default event: patch
        const ctx = options.patchContext;
        const o = isPatchOp(data.o) ? (data.o as PatchOp) : ctx.lastOp;
        const p = typeof data.p === "string" ? data.p : ctx.lastPath;
        const v = data.v;

        if (!o || p === null) return;

        // Save previous non-batch op for batch item inheritance.
        const prevOp = ctx.lastOp !== "batch" ? ctx.lastOp : null;

        // Update sticky context
        if (data.o !== undefined) ctx.lastOp = o;
        if (data.p !== undefined) ctx.lastPath = p;

        options.updateState((currentState) => {
          if (!currentState) return currentState;
          return produce(currentState, (draft) => {
            const message = options.resolveMessage(draft as TState);
            if (!message) return;

            if (o === "batch" && Array.isArray(v)) {
              for (const item of v as BatchItem[]) {
                const itemOp = item.o ?? prevOp;
                if (!itemOp) continue;
                applyPathPatch(message, item.p ?? p, itemOp, item.v);
              }
            } else if (o !== "batch") {
              applyPathPatch(message, p, o, v);
            }
          });
        });
      } catch (error) {
        options.onParseError?.(
          error instanceof Error ? error : new Error("Failed to parse stream"),
        );
      }
    },
  });
}
