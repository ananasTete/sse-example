export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
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
