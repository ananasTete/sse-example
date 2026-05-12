import type {
  LifecycleType,
  MutationEnvelope,
  MutationOp,
  Target,
} from "../types";
import { sendSseFrame } from "./sse";

export interface MutationEmitter {
  sendLifecycle(type: LifecycleType, data?: Record<string, unknown>): void;
  sendMutation(params: {
    target: Target;
    op: MutationOp;
    path: string;
    value: unknown;
  }): void;
}

export function createMutationEmitter(
  controller: ReadableStreamDefaultController,
): MutationEmitter {
  const encoder = new TextEncoder();
  let lastTarget: Target | null = null;
  let lastOp: MutationOp | null = null;
  let lastPath: string | null = null;

  const isSameTarget = (next: Target, previous: Target | null) =>
    previous !== null &&
    next.type === previous.type &&
    next.id === previous.id &&
    next.parent?.type === previous.parent?.type &&
    next.parent?.id === previous.parent?.id &&
    JSON.stringify(next.scope ?? []) === JSON.stringify(previous.scope ?? []);

  return {
    sendLifecycle(type, data = {}) {
      sendSseFrame(controller, encoder, {
        event: type,
        data,
      });
    },
    sendMutation(params) {
      const payload: MutationEnvelope = { value: params.value };

      if (!isSameTarget(params.target, lastTarget)) {
        payload.target = params.target;
      }

      if (params.op !== lastOp) {
        payload.op = params.op;
      }

      if (params.path !== lastPath) {
        payload.path = params.path;
      }

      lastTarget = params.target;
      lastOp = params.op;
      lastPath = params.path;

      sendSseFrame(controller, encoder, {
        data: payload,
      });
    },
  };
}
