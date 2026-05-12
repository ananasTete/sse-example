import { createParser, type EventSourceMessage } from "eventsource-parser";
import { produce } from "immer";
import type {
  MutationEnvelope,
  MutationOp,
  ChatStreamPatchContext,
  Target,
} from "../types";
import { applyPathPatch } from "./patch-apply";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMutationOp = (value: unknown): value is MutationOp =>
  value === "upsert" ||
  value === "set" ||
  value === "append" ||
  value === "delete";

const isTarget = (value: unknown): value is Target => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (
    value.type !== "session" &&
    value.type !== "message" &&
    value.type !== "block" &&
    value.type !== "artifact" &&
    value.type !== "run"
  ) {
    return false;
  }
  return typeof value.id === "string" || typeof value.id === "number";
};

const isPartialMutationEnvelope = (
  value: unknown,
): value is MutationEnvelope =>
  isRecord(value) &&
  (!("target" in value) || isTarget(value.target)) &&
  (!("op" in value) || isMutationOp(value.op)) &&
  (!("path" in value) || typeof value.path === "string") &&
  "value" in value;

type ResolvedMutationEnvelope = MutationEnvelope & {
  target: Target;
  op: MutationOp;
  path: string;
};

function resolveMutationEnvelope(
  value: unknown,
  context: ChatStreamPatchContext,
): ResolvedMutationEnvelope | null {
  if (!isPartialMutationEnvelope(value)) return null;

  const target = value.target ?? context.lastTarget;
  const op = value.op ?? context.lastOperation;
  const path = value.path ?? context.lastPath;

  if (!target || !op || path === null) return null;

  return {
    ...value,
    target,
    op,
    path,
  };
}

export interface MutationStreamParserOptions<TState> {
  updateState: (
    updater: (state: TState | undefined) => TState | undefined,
  ) => void;
  onLifecycle?: (event: string, data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  isResponseMessage?: (value: unknown) => boolean;
  getResponseMessageId?: (value: unknown) => number | null;
  upsertResponse?: (draft: TState, response: unknown) => void;
  resolveMutationTarget: (
    draft: TState,
    target: Target,
  ) => unknown | null;
  patchContext: ChatStreamPatchContext;
}

function applyMutationToTarget<TState>(
  draft: TState,
  options: MutationStreamParserOptions<TState>,
  mutation: ResolvedMutationEnvelope,
) {
  if (
    mutation.target.type === "message" &&
    mutation.op === "upsert" &&
    mutation.path === "" &&
    options.isResponseMessage?.(mutation.value)
  ) {
    const responseMessageId =
      options.getResponseMessageId?.(mutation.value) ?? null;
    options.patchContext.responseMessageId = responseMessageId;
    options.patchContext.responseMessageIndex = null;
    options.upsertResponse?.(draft, mutation.value);
    return;
  }

  const mutationTarget = options.resolveMutationTarget(draft, mutation.target);
  if (!mutationTarget) return;

  if (mutation.path) {
    applyPathPatch(
      mutationTarget,
      mutation.path,
      mutation.op,
      mutation.value,
    );
  }
}

export function applyStreamData<TState>(
  currentState: TState | undefined,
  options: MutationStreamParserOptions<TState>,
  data: unknown,
) {
  if (!currentState || !isRecord(data)) return currentState;
  const mutation = resolveMutationEnvelope(data, options.patchContext);
  if (!mutation) return currentState;

  return produce(currentState, (draft) => {
    applyMutationToTarget(draft as TState, options, mutation);
    options.patchContext.lastTarget = mutation.target;
    options.patchContext.lastPath = mutation.path;
    options.patchContext.lastOperation = mutation.op;
  });
}

export function createMutationStreamParser<TState>(
  options: MutationStreamParserOptions<TState>,
) {
  return createParser({
    onEvent: (event: EventSourceMessage) => {
      if (!event.data) return;

      try {
        const data = JSON.parse(event.data) as unknown;

        if (event.event) {
          if (isRecord(data)) {
            options.onLifecycle?.(event.event, data);
          }
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

export const createPatchStreamParser = createMutationStreamParser;
export type PatchStreamParserOptions<TState> =
  MutationStreamParserOptions<TState>;
