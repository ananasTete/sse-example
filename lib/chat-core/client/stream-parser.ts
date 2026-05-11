import { createParser, type EventSourceMessage } from "eventsource-parser";
import { produce } from "immer";
import type {
  ChatPatchOperation,
  ChatPatchTarget,
  ChatStreamPatch,
  ChatStreamPatchContext,
} from "../types";
import { applyPathPatch } from "./patch-apply";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChatPatchOperation = (value: unknown): value is ChatPatchOperation =>
  value === "APPEND" || value === "SET" || value === "BATCH";

const isChatPatchTarget = (value: unknown): value is ChatPatchTarget => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "response") return true;
  return (
    value.type === "fragment" &&
    (typeof value.id === "string" || typeof value.id === "number")
  );
};

export interface PatchStreamParserOptions<TState> {
  updateState: (
    updater: (state: TState | undefined) => TState | undefined,
  ) => void;
  onEvent?: (eventName: string, data: unknown) => void;
  onError?: (error: Error) => void;
  isResponseMessage?: (value: unknown) => boolean;
  getResponseMessageId?: (value: unknown) => number | null;
  upsertResponse?: (draft: TState, response: unknown) => void;
  resolvePatchTarget: (
    draft: TState,
    target: ChatPatchTarget,
  ) => unknown | null;
  patchContext: ChatStreamPatchContext;
}

function applyPatchToTarget<TState>(
  draft: TState,
  options: PatchStreamParserOptions<TState>,
  target: ChatPatchTarget,
  patch: Required<Pick<ChatStreamPatch, "p" | "v">> & {
    o?: ChatPatchOperation;
  },
) {
  const patchTarget = options.resolvePatchTarget(draft, target);
  if (!patchTarget) return;

  const operation = patch.o ?? "SET";
  if (operation === "BATCH" && Array.isArray(patch.v)) {
    for (const childPatch of patch.v) {
      if (!isRecord(childPatch) || typeof childPatch.p !== "string") continue;
      applyPathPatch(
        patchTarget,
        childPatch.p,
        isChatPatchOperation(childPatch.o) ? childPatch.o : "SET",
        childPatch.v,
      );
    }
    return;
  }

  const relativePath =
    target.type === "response" && patch.p.startsWith("response/")
      ? patch.p.slice("response/".length)
      : target.type === "response" && patch.p === "response"
        ? ""
        : patch.p;

  if (relativePath) {
    applyPathPatch(patchTarget, relativePath, operation, patch.v);
  }
}

export function applyStreamData<TState>(
  currentState: TState | undefined,
  options: PatchStreamParserOptions<TState>,
  data: unknown,
) {
  if (!currentState || !isRecord(data)) return currentState;

  return produce(currentState, (draft) => {
    const response = isRecord(data.v) ? data.v.response : undefined;
    if (response !== undefined && options.isResponseMessage?.(response)) {
      const responseMessageId = options.getResponseMessageId?.(response) ?? null;
      options.patchContext.responseMessageId = responseMessageId;
      options.patchContext.responseMessageIndex = null;
      options.patchContext.lastTarget = null;
      options.patchContext.lastPath = null;
      options.patchContext.lastOperation = null;
      options.upsertResponse?.(draft as TState, response);
      return;
    }

    const target = isChatPatchTarget(data.t)
      ? data.t
      : options.patchContext.lastTarget ?? { type: "response" as const };

    if (typeof data.p === "string") {
      const operation = isChatPatchOperation(data.o) ? data.o : "SET";
      applyPatchToTarget(draft as TState, options, target, {
        p: data.p,
        o: operation,
        v: data.v,
      });
      options.patchContext.lastTarget = target;
      options.patchContext.lastPath = data.p;
      options.patchContext.lastOperation = operation;
      return;
    }

    if ("v" in data && options.patchContext.lastPath) {
      applyPatchToTarget(
        draft as TState,
        options,
        options.patchContext.lastTarget ?? target,
        {
          p: options.patchContext.lastPath,
          o: options.patchContext.lastOperation ?? "SET",
          v: data.v,
        },
      );
    }
  });
}

export function createPatchStreamParser<TState>(
  options: PatchStreamParserOptions<TState>,
) {
  return createParser({
    onEvent: (event: EventSourceMessage) => {
      if (!event.data) return;

      try {
        const data = JSON.parse(event.data) as unknown;

        if (event.event) {
          options.onEvent?.(event.event, data);
          return;
        }

        options.updateState((currentState) =>
          applyStreamData(currentState, options, data),
        );
      } catch (error) {
        options.onError?.(
          error instanceof Error ? error : new Error("Failed to parse stream"),
        );
      }
    },
  });
}
