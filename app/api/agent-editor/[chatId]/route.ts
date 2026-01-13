// app/api/agent-editor/[chatId]/route.ts
import { NextRequest } from "next/server";

export const runtime = "edge";

// 聊天上下文类型（与前端共享）
interface ChatContext {
  mode: "fulltext" | "selection";
  content: string;
  selection?: { from: number; to: number; text: string };
}

// 请求 payload 类型
interface ChatPayload {
  context: ChatContext;
  userRequest: string;
}

// 消息 Part 类型
interface MessagePart {
  type: string;
  text?: string;
}

// 消息类型
interface ChatMessage {
  role: "user" | "assistant";
  parts: MessagePart[];
}

// 请求体类型
interface RequestBody {
  messages: ChatMessage[];
  model: string;
}

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

// 解析用户消息中的 payload
const parsePayload = (text: string): ChatPayload | null => {
  try {
    return JSON.parse(text) as ChatPayload;
  } catch {
    return null;
  }
};

// 生成改写建议
const generateRewriteSuggestions = (originalText: string, request: string) => {
  // 模拟生成多个改写方案
  return [
    {
      label: "更简洁",
      newText: `${originalText.slice(0, Math.floor(originalText.length * 0.7))}...（简化版）`,
      status: "idle",
    },
    {
      label: "更正式",
      newText: `尊敬的读者，${originalText}（正式版）`,
      status: "idle",
    },
    {
      label: "更生动",
      newText: `${originalText}！这真是太棒了！（生动版）`,
      status: "idle",
    },
  ];
};

// 生成编辑建议（全文模式）
const generateEditSuggestions = (fullText: string, request: string) => {
  // 模拟生成多处编辑建议
  const sentences = fullText.split(/[。！？\n]/).filter((s) => s.trim());
  const edits = [];

  if (sentences.length > 0) {
    edits.push({
      label: "第 1 处修改",
      originalText: sentences[0],
      newText: `【优化】${sentences[0]}`,
      status: "idle",
    });
  }

  if (sentences.length > 2) {
    edits.push({
      label: "第 2 处修改",
      originalText: sentences[2],
      newText: `【改进】${sentences[2]}`,
      status: "idle",
    });
  }

  return edits;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = (await req.json()) as RequestBody;
  const { messages, model } = body;

  // 解析最后一条消息
  const lastMsg = messages[messages.length - 1];
  const userText =
    lastMsg?.parts?.find((p) => p.type === "text")?.text || "";

  // 解析结构化 payload
  const payload = parsePayload(userText);

  // 从 payload 中提取上下文和用户请求
  const context = payload?.context;
  const userRequest = payload?.userRequest || userText;
  const selectionMode = context?.mode === "selection";
  const selectedContent = context?.content || "";

  console.log(`[Agent Editor ${chatId}] Mode: ${context?.mode}, Request: ${userRequest}`);

  const messageId = generateId();
  const reasoningId = `rs_${generateId()}`;
  const textId = `msg_${generateId()}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // === 开始阶段 ===
      sendEvent(controller, encoder, {
        type: "start",
        messageId,
        modelId: model,
      });
      await delay(50);
      sendEvent(controller, encoder, { type: "start-step" });
      await delay(50);

      // 推理阶段
      const reasoningText = selectionMode
        ? `用户选中了一段文字："${selectedContent.slice(0, 30)}..."，请求是："${userRequest}"。我将生成多个改写方案供用户选择。`
        : `用户请求对全文进行处理："${userRequest}"。我将分析全文并提供修改建议。`;

      sendEvent(controller, encoder, {
        type: "reasoning-start",
        id: reasoningId,
      });
      await delay(30);

      for (const char of reasoningText) {
        sendEvent(controller, encoder, {
          type: "reasoning-delta",
          id: reasoningId,
          delta: char,
        });
        await delay(15);
      }

      sendEvent(controller, encoder, {
        type: "reasoning-end",
        id: reasoningId,
      });
      await delay(50);

      if (selectionMode) {
        // === 选中模式：调用 suggest_rewrite 工具 ===
        const toolCallId = `call_${generateId()}`;
        const toolName = "suggest_rewrite";
        const suggestions = generateRewriteSuggestions(selectedContent, userRequest);

        // 工具调用开始
        sendEvent(controller, encoder, {
          type: "tool-input-start",
          toolCallId,
          toolName,
        });
        await delay(50);

        // 流式生成工具参数
        const inputJson = JSON.stringify({ suggestions });
        for (const char of inputJson) {
          sendEvent(controller, encoder, {
            type: "tool-input-delta",
            toolCallId,
            inputTextDelta: char,
          });
          await delay(10);
        }
        await delay(100);

        // 工具参数完整可用
        sendEvent(controller, encoder, {
          type: "tool-input-available",
          toolCallId,
          toolName,
          input: { suggestions },
        });
        await delay(200);

        // 工具执行结果
        sendEvent(controller, encoder, {
          type: "tool-output-available",
          toolCallId,
          output: { success: true, count: suggestions.length },
        });
        await delay(100);

        // 生成文本回复
        sendEvent(controller, encoder, { type: "text-start", id: textId });
        await delay(30);

        const responseText = `我为你生成了 ${suggestions.length} 个改写方案，请选择一个应用到编辑器中：`;

        for (const char of responseText) {
          sendEvent(controller, encoder, {
            type: "text-delta",
            id: textId,
            delta: char,
          });
          await delay(20);
        }

        sendEvent(controller, encoder, { type: "text-end", id: textId });
      } else {
        // === 全文模式：每个 edit 作为单独的 tool call ===
        const fullText = selectedContent; // 直接使用结构化的 context.content
        const toolName = "suggest_edit";
        const edits = generateEditSuggestions(fullText, userRequest);

        // 每个 edit 单独发送一个 tool call
        for (const edit of edits) {
          const toolCallId = `call_${generateId()}`;

          // 工具调用开始
          sendEvent(controller, encoder, {
            type: "tool-input-start",
            toolCallId,
            toolName,
          });
          await delay(50);

          // 流式生成工具参数（单个 edit）
          const inputJson = JSON.stringify({ edit });
          for (const char of inputJson) {
            sendEvent(controller, encoder, {
              type: "tool-input-delta",
              toolCallId,
              inputTextDelta: char,
            });
            await delay(10);
          }
          await delay(100);

          // 工具参数完整可用
          sendEvent(controller, encoder, {
            type: "tool-input-available",
            toolCallId,
            toolName,
            input: { edit },
          });
          await delay(200);

          // 工具执行结果
          sendEvent(controller, encoder, {
            type: "tool-output-available",
            toolCallId,
            output: { success: true },
          });
          await delay(100);
        }

        // 生成文本回复
        sendEvent(controller, encoder, { type: "text-start", id: textId });
        await delay(30);

        const responseText = edits.length > 0
          ? `我分析了全文内容，建议对以下 ${edits.length} 处进行修改：`
          : `我已阅读全文内容。关于你的请求"${userRequest}"，我的建议是：保持当前内容，它已经很好了。`;

        for (const char of responseText) {
          sendEvent(controller, encoder, {
            type: "text-delta",
            id: textId,
            delta: char,
          });
          await delay(20);
        }

        sendEvent(controller, encoder, { type: "text-end", id: textId });
      }

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
