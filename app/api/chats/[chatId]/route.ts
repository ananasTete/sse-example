// app/api/chats/[chatId]/route.ts
import { NextRequest } from "next/server";

export const runtime = "edge";

// 生成随机 ID
const generateId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}`;

// SSE 事件发送辅助函数
const sendEvent = (
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: object | string
) => {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
};

// 延迟函数
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await req.json();
  const { messages } = body;

  // 解析最后一条消息
  const lastMsg = messages[messages.length - 1];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userText =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastMsg?.parts?.find((p: any) => p.type === "text")?.text || "";

  console.log(`[Chat ${chatId}] User said: ${userText}`);

  // 模拟 AI 响应内容
  const reasoningText = `让我思考一下这个问题...用户说的是: "${userText}"。我需要理解这个请求并给出合适的回复。`;
  const responseText = `你好！我收到了你的消息。\n\n你说的是: "${userText}"\n\n这是一个模拟的 AI 回复，用于测试 SSE 协议。`;

  const messageId = generateId();
  const reasoningId = `rs_${generateId()}`;
  const textId = `msg_${generateId()}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // === 开始阶段 ===
      sendEvent(controller, encoder, { type: "start", messageId });
      await delay(50);
      sendEvent(controller, encoder, { type: "start-step" });
      await delay(50);

      // === 推理阶段 ===
      sendEvent(controller, encoder, {
        type: "reasoning-start",
        id: reasoningId,
      });
      await delay(30);

      // 逐字符发送推理内容
      for (const char of reasoningText) {
        sendEvent(controller, encoder, {
          type: "reasoning-delta",
          id: reasoningId,
          delta: char,
        });
        await delay(20);
      }

      sendEvent(controller, encoder, {
        type: "reasoning-end",
        id: reasoningId,
      });
      await delay(50);

      // === 文本阶段 ===
      sendEvent(controller, encoder, { type: "text-start", id: textId });
      await delay(30);

      // 逐字符发送文本内容
      for (const char of responseText) {
        sendEvent(controller, encoder, {
          type: "text-delta",
          id: textId,
          delta: char,
        });
        await delay(30);
      }

      sendEvent(controller, encoder, { type: "text-end", id: textId });
      await delay(50);

      // === 结束阶段 ===
      sendEvent(controller, encoder, { type: "finish-step" });
      await delay(30);
      sendEvent(controller, encoder, { type: "finish", finishReason: "stop" });
      await delay(30);
      sendEvent(controller, encoder, "[DONE]");

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
