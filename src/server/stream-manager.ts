import { EventEmitter } from "events";
import type { MessagePart, StreamEvent } from "../types/chat-advanced";

export const streamBus = new EventEmitter();

export type SequencedStreamEvent = StreamEvent & { seq: number };

export interface ActiveStreamState {
  active: boolean;
  producerStarted: boolean;
  nextSeq: number;
  events: SequencedStreamEvent[];
  finishedAt: number | null;
}

// 存储当前正在生成的任务状态
export const activeStreams = new Map<string, ActiveStreamState>();
export const activeStreamParts = new Map<string, MessagePart[]>();
const streamStartLocks = new Set<string>();
const streamCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const FINISHED_STREAM_TTL_MS = 60_000;

export function acquireStreamStartLock(messageId: string) {
  if (streamStartLocks.has(messageId)) {
    return false;
  }
  streamStartLocks.add(messageId);
  return true;
}

export function releaseStreamStartLock(messageId: string) {
  streamStartLocks.delete(messageId);
}

export function initActiveStream(messageId: string) {
  const existingTimer = streamCleanupTimers.get(messageId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    streamCleanupTimers.delete(messageId);
  }

  activeStreams.set(messageId, {
    active: true,
    producerStarted: false,
    nextSeq: 1,
    events: [],
    finishedAt: null,
  });
}

export function markStreamProducerStarted(messageId: string) {
  const state = activeStreams.get(messageId);
  if (!state) return;
  state.producerStarted = true;
}

export function isActiveStream(messageId: string) {
  return activeStreams.get(messageId)?.active ?? false;
}

export function cancelActiveStream(messageId: string) {
  const state = activeStreams.get(messageId);
  if (!state) return;
  state.active = false;
}

export function finishActiveStream(messageId: string, ttlMs = FINISHED_STREAM_TTL_MS) {
  const state = activeStreams.get(messageId);
  if (!state) return;
  state.active = false;
  state.finishedAt = Date.now();
  releaseStreamStartLock(messageId);

  const existingTimer = streamCleanupTimers.get(messageId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const cleanupTimer = setTimeout(() => {
    activeStreams.delete(messageId);
    streamCleanupTimers.delete(messageId);
  }, ttlMs);

  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  streamCleanupTimers.set(messageId, cleanupTimer);
}

export function emitStreamEvent(messageId: string, event: StreamEvent) {
  const state = activeStreams.get(messageId);
  if (!state) return null;
  const sequencedEvent: SequencedStreamEvent = { ...event, seq: state.nextSeq++ };
  state.events.push(sequencedEvent);
  if (state.events.length > 1000) {
    state.events.shift();
  }
  try {
    streamBus.emit(`stream:${messageId}`, sequencedEvent);
  } catch (error) {
    console.error("Unhandled stream listener error", error);
  }
  return sequencedEvent;
}

export function getStreamEventsAfter(messageId: string, afterSeq: number) {
  const state = activeStreams.get(messageId);
  if (!state) return [];
  return state.events.filter((event) => event.seq > afterSeq);
}
