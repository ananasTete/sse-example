import { createFileRoute } from "@tanstack/react-router";
import {
  streamBus,
  activeStreams,
  cancelActiveStream,
  getStreamEventsAfter,
  type SequencedStreamEvent,
} from "@/src/server/stream-manager";
import { jsonError } from "@/src/server/http/json";
import { createSseResponse } from "@/src/server/http/sse";

export const Route = createFileRoute("/api/advanced-chat/$chatId/resume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          const parsed = await request.json();
          if (!parsed || typeof parsed !== "object") {
            return jsonError("Invalid request body", 400);
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return jsonError("Invalid request body", 400);
        }

        const leafId = typeof body.leafId === "string" ? body.leafId : null;
        const action = typeof body.action === "string" ? body.action : null;
        const afterSeq =
          typeof body.afterSeq === "number" && Number.isFinite(body.afterSeq)
            ? body.afterSeq
            : 0;

        if (!leafId) {
          return jsonError("Missing leafId", 400);
        }

        if (action === "cancel") {
          if (!activeStreams.has(leafId)) {
            return new Response(
              JSON.stringify({ error: "Stream already finished" }),
              { status: 410, headers: { "Content-Type": "application/json" } },
            );
          }
          cancelActiveStream(leafId);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const streamState = activeStreams.get(leafId);
        if (!streamState) {
          return new Response(
            JSON.stringify({ error: "Stream already finished" }),
            { status: 410, headers: { "Content-Type": "application/json" } },
          );
        }
        const hasReplayEvents = getStreamEventsAfter(leafId, afterSeq).length > 0;
        if (!streamState.active && !hasReplayEvents) {
          return new Response(
            JSON.stringify({ error: "Stream already finished" }),
            { status: 410, headers: { "Content-Type": "application/json" } },
          );
        }

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let closed = false;
            let cleanup = () => {};

            const close = () => {
              if (closed) return;
              closed = true;
              try {
                controller.close();
              } catch {
                // ignore close errors
              }
            };

            const push = (data: SequencedStreamEvent) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                closed = true;
                cleanup();
              }
            };

            cleanup = () => {
              streamBus.off(`stream:${leafId}`, onEvent);
              request.signal.removeEventListener("abort", onAbort);
            };

            const onEvent = (data: SequencedStreamEvent) => {
              push(data);
              if (data.type === "message_stop") {
                cleanup();
                close();
              }
            };

            const onAbort = () => {
              cleanup();
              close();
            };

            const replayEvents = getStreamEventsAfter(leafId, afterSeq);

            if (!streamState.active && replayEvents.length === 0) {
              cleanup();
              close();
              return;
            }

            for (const replayEvent of replayEvents) {
              push(replayEvent);
              if (replayEvent.type === "message_stop") {
                cleanup();
                close();
                return;
              }
            }

            const latestState = activeStreams.get(leafId);
            if (!latestState?.active) {
              cleanup();
              close();
              return;
            }

            streamBus.on(`stream:${leafId}`, onEvent);
            request.signal.addEventListener("abort", onAbort);
          },
        });

        return createSseResponse(stream);
      },
    },
  },
});
