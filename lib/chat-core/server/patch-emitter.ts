import type { PatchOp, ReadyPayload, SessionPayload, DonePayload, ErrorPayload, BatchItem } from "../types";
import { sendSseFrame } from "./sse";

export interface PatchEmitter {
  sendReady(data: ReadyPayload): void;
  sendUpsertMessage(message: Record<string, unknown>): void;
  sendSession(data: SessionPayload): void;
  sendDone(data: DonePayload): void;
  sendError(data: ErrorPayload): void;
  sendPatch(o: PatchOp, p: string, v: unknown): void;
  sendBatch(p: string, items: BatchItem[]): void;
}

export function createPatchEmitter(
  controller: ReadableStreamDefaultController,
): PatchEmitter {
  const encoder = new TextEncoder();
  let lastOp: PatchOp | null = null;
  let lastPath: string | null = null;

  const send = (frame: { event?: string; data: unknown }) => {
    sendSseFrame(controller, encoder, frame as { event?: string; data: object | string });
  };

  return {
    sendReady(data) {
      send({ event: "ready", data });
    },
    sendUpsertMessage(message) {
      send({ event: "upsert_message", data: message });
    },
    sendSession(data) {
      send({ event: "update_session", data });
    },
    sendDone(data) {
      send({ event: "done", data });
    },
    sendError(data) {
      send({ event: "error", data });
    },
    sendPatch(o, p, v) {
      const payload: Record<string, unknown> = { v };
      if (o !== lastOp || p !== lastPath) {
        payload.o = o;
        payload.p = p;
      }
      lastOp = o;
      lastPath = p;
      send({ data: payload });
    },

    sendBatch(p, items) {
      const payload: Record<string, unknown> = { v: items };
      if ("batch" !== lastOp || p !== lastPath) {
        payload.o = "batch";
        payload.p = p;
      }
      lastOp = "batch";
      lastPath = p;
      send({ data: payload });
    },
  };
}
