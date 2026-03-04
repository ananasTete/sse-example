export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function sendSseEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: object | string,
) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
}

interface SseFrameInput {
  id?: string | number;
  event?: string;
  data: object | string;
}

export function sendSseFrame(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  input: SseFrameInput,
) {
  const lines: string[] = [];
  if (input.id !== undefined) {
    lines.push(`id: ${String(input.id)}`);
  }
  if (input.event) {
    lines.push(`event: ${input.event}`);
  }
  const payload =
    typeof input.data === "string" ? input.data : JSON.stringify(input.data);
  lines.push(`data: ${payload}`);
  lines.push("");
  controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
}

export function createSseResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
