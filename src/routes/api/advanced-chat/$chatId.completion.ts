import { createFileRoute } from "@tanstack/react-router";
import { streamBus, activeStreams, activeStreamParts } from "@/src/server/stream-manager";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { jsonError } from "@/src/server/http/json";
import type { MessagePart } from "@/src/types/chat-advanced";

export const Route = createFileRoute("/api/advanced-chat/$chatId/completion")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid request body", 400);
        }

        const { turn_message_uuids, prompt, parentId } = body;
        const assistantMsgId = turn_message_uuids?.assistant;
        const humanMsgId = turn_message_uuids?.human;

        if (!assistantMsgId) {
          return jsonError("Missing assistant message uuid", 400);
        }

        activeStreams.set(assistantMsgId, true);

        // Run in background
        runLLMTaskInBackground(
          params.chatId,
          assistantMsgId,
          prompt,
          parentId,
          humanMsgId,
        ).catch(console.error);

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
              streamBus.off(`stream:${assistantMsgId}`, onEvent);
            };

            streamBus.on(`stream:${assistantMsgId}`, onEvent);
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

async function runLLMTaskInBackground(
  chatId: string,
  msgId: string,
  prompt: string,
  parentId: string,
  humanMsgId?: string,
) {
  try {
    if (humanMsgId && prompt) {
      const latestUser = await prisma.message.findFirst({
        where: { chatId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const nextSeqUser = (latestUser?.seq ?? 0) + 1;

      await prisma.message.create({
        data: {
          id: humanMsgId,
          chatId,
          parentId,
          role: "user",
          partsJson: [{ type: "text", text: prompt, state: "done" }] as Prisma.InputJsonArray,
          status: "completed",
          seq: nextSeqUser,
        },
      });
    }

    const latestAssistant = await prisma.message.findFirst({
      where: { chatId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    const nextSeqAsst = (latestAssistant?.seq ?? 0) + 1;

    await prisma.message.create({
      data: {
        id: msgId,
        chatId,
        parentId: humanMsgId || parentId,
        role: "assistant",
        partsJson: [] as Prisma.InputJsonArray,
        status: "in_progress",
        seq: nextSeqAsst,
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { cursorMessageId: msgId },
    });

    const parts: MessagePart[] = [];
    activeStreamParts.set(msgId, parts);

    // 1. 发送 message_start
    streamBus.emit(`stream:${msgId}`, {
      type: "message_start",
      message: { id: msgId, role: "assistant", model: "openai/gpt-5-nano" }
    });

    // 2. 发送思考块 (Index 0)
    streamBus.emit(`stream:${msgId}`, {
      type: "content_block_start",
      index: 0,
      content_block: { type: "reasoning" }
    });
    let reasoningText = "Let me think deeply about this.\n";
    reasoningText += `You asked: ${prompt || "unknown"}\n`;
    reasoningText += "Looks like I need to use the weather tool.\n";
    
    parts.push({ type: "reasoning", text: "", state: "done" });
    for (const char of reasoningText) {
      (parts[0] as { type: "reasoning"; text: string }).text += char;
      streamBus.emit(`stream:${msgId}`, {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: char },
      });
      await new Promise((r) => setTimeout(r, 20));
      if (!activeStreams.get(msgId)) break;
    }
    streamBus.emit(`stream:${msgId}`, { type: "content_block_stop", index: 0 });

    if (!activeStreams.get(msgId)) return;

    // 3. 发送工具调用块 (Index 1) - 模拟天气工具
    streamBus.emit(`stream:${msgId}`, {
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "call_abc123", name: "weather" }
    });
    
    const mockToolInput = '{"location": "Tokyo", "unit": "celsius"}';
    parts.push({ 
      type: "tool_use", 
      tool_name: "weather", 
      tool_use_id: "call_abc123", 
      input_json: mockToolInput, 
      state: "done" 
    });

    // 模拟参数流式输出
    for (const char of mockToolInput) {
      streamBus.emit(`stream:${msgId}`, {
         type: "content_block_delta",
         index: 1,
         delta: { type: "input_json_delta", partial_json: char },
      });
      await new Promise((r) => setTimeout(r, 30));
    }
    streamBus.emit(`stream:${msgId}`, { type: "content_block_stop", index: 1 });

    if (!activeStreams.get(msgId)) return;

    // 4. 发送工具结果块 (Index 2)
    const weatherMockResult = {
      location: "Tokyo, Japan",
      temperature: 22,
      temperatureHigh: 25,
      temperatureLow: 18,
      condition: { text: "Sunny", icon: "☀️" },
      humidity: 45,
      windSpeed: 12,
      dailyForecast: [
        { day: "Today", high: 25, low: 18, condition: { text: "Sunny", icon: "☀️" } },
        { day: "Tomorrow", high: 23, low: 17, condition: { text: "Cloudy", icon: "☁️" } }
      ]
    };

    streamBus.emit(`stream:${msgId}`, {
      type: "content_block_start",
      index: 2,
      content_block: { type: "tool_result", id: "call_abc123", content: [weatherMockResult] }
    });

    parts.push({ 
      type: "tool_result", 
      tool_use_id: "call_abc123", 
      content: [weatherMockResult], 
      state: "done" 
    });

    streamBus.emit(`stream:${msgId}`, { type: "content_block_stop", index: 2 });

    if (!activeStreams.get(msgId)) return;

    // 5. 发送最终文本总结块 (Index 3)
    streamBus.emit(`stream:${msgId}`, {
      type: "content_block_start",
      index: 3,
      content_block: { type: "text" }
    });
    const textPart = "Based on the weather tool result, it is currently sunny in Tokyo with a temperature of 22°C. Have a great day!";

    parts.push({ type: "text", text: "", state: "done" });
    for (const char of textPart) {
      (parts[3] as { type: "text"; text: string }).text += char;
      streamBus.emit(`stream:${msgId}`, {
        type: "content_block_delta",
        index: 3,
        delta: { type: "text_delta", text: char },
      });
      await new Promise((r) => setTimeout(r, 20));
      if (!activeStreams.get(msgId)) break;
    }
    streamBus.emit(`stream:${msgId}`, { type: "content_block_stop", index: 3 });

    // 6. 发送流式结束与限界警告
    streamBus.emit(`stream:${msgId}`, {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
    });
    
    streamBus.emit(`stream:${msgId}`, {
      type: "message_limit",
      message_limit: { type: "within_limit", remaining: 49, utilization: 0.02 }
    });

    streamBus.emit(`stream:${msgId}`, {
      type: "message_stop",
    });

    await prisma.message.update({
      where: { id: msgId },
      data: { status: "completed", partsJson: parts as Prisma.InputJsonArray },
    });
  } catch (err) {
    console.error("runLLMTaskInBackground error:", err);
    try {
      await prisma.message.update({
        where: { id: msgId },
        data: { status: "error" },
      });
    } catch {
      // ignore
    }
  } finally {
    activeStreams.delete(msgId);
    activeStreamParts.delete(msgId);
  }
}
