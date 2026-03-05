import { createParser, type ParsedEvent } from "eventsource-parser";
import type { StreamEvent, EventDelta, BlockType } from "../types/chat-advanced";

export interface SSECallbacks {
  onMessageStart?: (message: { id: string; role: string; model?: string }) => void;
  onContentBlockStart?: (index: number, block: { type: BlockType; id?: string; name?: string }) => void;
  onContentBlockDelta?: (index: number, delta: EventDelta) => void;
  onContentBlockStop?: (index: number) => void;
  onMessageDelta?: (delta: { stop_reason?: string | null }) => void;
  onMessageStop?: () => void;
  onMessageLimit?: (limitInfo: { type: string; resetsAt?: number; remaining?: number; utilization?: number }) => void;
  onError?: (error: { type: string; message: string }) => void;
}

export class SSEEventProcessor {
  private parser: ReturnType<typeof createParser>;

  constructor(private callbacks: SSECallbacks) {
    this.parser = createParser({
      onEvent: (event: ParsedEvent) => {
        this.handleEvent(event);
      }
    });
  }

  private handleEvent(event: ParsedEvent) {
    if (!event.data) return;
    // Special handling for [DONE] if the streaming API sends it
    if (event.data === "[DONE]") return;

    try {
      const data = JSON.parse(event.data) as StreamEvent;
      switch (data.type) {
        case "message_start":
          this.callbacks.onMessageStart?.(data.message);
          break;
        case "content_block_start":
          this.callbacks.onContentBlockStart?.(data.index, data.content_block);
          break;
        case "content_block_delta":
          this.callbacks.onContentBlockDelta?.(data.index, data.delta);
          break;
        case "content_block_stop":
          this.callbacks.onContentBlockStop?.(data.index);
          break;
        case "message_delta":
          this.callbacks.onMessageDelta?.(data.delta);
          break;
        case "message_stop":
          this.callbacks.onMessageStop?.();
          break;
        case "message_limit":
          this.callbacks.onMessageLimit?.(data.message_limit);
          break;
        case "error":
          this.callbacks.onError?.(data.error);
          break;
      }
    } catch (e) {
      console.error("Failed to parse SSE event data", e);
    }
  }

  public feed(chunk: string) {
    this.parser.feed(chunk);
  }
}
