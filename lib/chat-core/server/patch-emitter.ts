import type { ChatPatchTarget, ChatStreamPatch } from "../types";
import { sendSseEvent, sendSseFrame } from "./sse";

export interface PatchEmitter {
  sendPatch(patch: ChatStreamPatch & { t: ChatPatchTarget; p: string }): void;
  sendFullData(data: object | string): void;
  sendEventFrame(frame: { event: string; data: object | string }): void;
}

function isSamePatchTarget(a: ChatPatchTarget, b: ChatPatchTarget | null) {
  return (
    b !== null &&
    a.type === b.type &&
    ("id" in a ? a.id : null) === ("id" in b ? b.id : null)
  );
}

export function createPatchEmitter(
  controller: ReadableStreamDefaultController,
): PatchEmitter {
  const encoder = new TextEncoder();
  let lastPatchTarget: ChatPatchTarget | null = null;
  let lastPatchPath: string | null = null;
  let lastPatchOperation: string | null = null;

  const resetPatchContext = () => {
    lastPatchTarget = null;
    lastPatchPath = null;
    lastPatchOperation = null;
  };

  return {
    sendPatch(patch) {
      const operation = patch.o ?? null;
      if (
        isSamePatchTarget(patch.t, lastPatchTarget) &&
        patch.p === lastPatchPath &&
        operation === lastPatchOperation
      ) {
        sendSseEvent(controller, encoder, { v: patch.v });
        return;
      }

      lastPatchTarget = patch.t;
      lastPatchPath = patch.p;
      lastPatchOperation = operation;
      sendSseEvent(controller, encoder, patch);
    },
    sendFullData(data) {
      resetPatchContext();
      sendSseEvent(controller, encoder, data);
    },
    sendEventFrame(frame) {
      resetPatchContext();
      sendSseFrame(controller, encoder, frame);
    },
  };
}
