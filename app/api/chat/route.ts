import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: "sk-5419bd81329041e7a9e232e816d093ec",
});

export const runtime = "edge";

export async function POST(req: Request) {
   const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 模拟 AI 生成
      const text = "这是一段优化后的非常专业的文本 (POST)。";
      for (const char of text) {
        // 必须遵循 SSE 格式: data: <内容>\n\n
        const chunk = JSON.stringify({ text: char });
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        await new Promise(r => setTimeout(r, 100)); // 模拟延迟
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 模拟 AI 生成 (GET 请求)
      const text = "这是通过 GET 请求获取的流式数据示例。";
      for (const char of text) {
        // 必须遵循 SSE 格式: data: <内容>\n\n
        const chunk = JSON.stringify({ text: char });
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        await new Promise(r => setTimeout(r, 100)); // 模拟延迟
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
