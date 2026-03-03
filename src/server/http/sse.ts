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

export function createSseResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
