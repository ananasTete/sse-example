import { createFileRoute } from "@tanstack/react-router";
import { streamBus, activeStreams } from "@/src/server/stream-manager";
import { jsonError } from "@/src/server/http/json";

export const Route = createFileRoute("/api/advanced-chat/$chatId/resume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid request body", 400);
        }

        const { leafId } = body;

        if (!activeStreams.get(leafId)) {
          return new Response(
            JSON.stringify({ error: "Stream already finished" }),
            { status: 410, headers: { "Content-Type": "application/json" } },
          );
        }

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();

            const onEvent = (data: Record<string, unknown>) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
              );
              if (data.type === "message_stop") {
                cleanup();
                controller.close();
              }
            };

            const cleanup = () => {
              streamBus.off(`stream:${leafId}`, onEvent);
            };

            streamBus.on(`stream:${leafId}`, onEvent);
            request.signal.addEventListener("abort", cleanup);
          },
        });

        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    },
  },
});
