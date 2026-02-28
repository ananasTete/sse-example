import { createSseResponse, sendSseEvent } from "@/src/server/http/sse";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createSimpleSseStream(text: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const char of text) {
        const chunk = JSON.stringify({ text: char });
        sendSseEvent(controller, encoder, chunk);
        await delay(100);
      }
      sendSseEvent(controller, encoder, "[DONE]");
      controller.close();
    },
  });

  return createSseResponse(stream);
}

export async function simpleChatPostHandler(_request: Request) {
  return createSimpleSseStream("这是一段优化后的非常专业的文本 (POST)。");
}

export async function simpleChatGetHandler(_request: Request) {
  return createSimpleSseStream("这是通过 GET 请求获取的流式数据示例。");
}
