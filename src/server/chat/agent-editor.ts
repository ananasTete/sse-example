import { createSseResponse, sendSseEvent } from "@/src/server/http/sse";

interface ChatContext {
  mode: "fulltext" | "selection";
  content: string;
  selection?: { from: number; to: number; text: string };
}

interface ChatPayload {
  context: ChatContext;
  userRequest: string;
}

interface MessagePart {
  type: string;
  text?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  parts: MessagePart[];
}

interface RequestBody {
  messages: ChatMessage[];
  model: string;
}

const generateId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const parsePayload = (text: string): ChatPayload | null => {
  try {
    return JSON.parse(text) as ChatPayload;
  } catch {
    return null;
  }
};

const generateRewriteSuggestions = (originalText: string, _request: string) => {
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

const generateEditSuggestions = (fullText: string, _request: string) => {
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

export async function agentEditorStreamHandler(request: Request, chatId: string) {
  const body = (await request.json()) as RequestBody;
  const { messages, model } = body;

  const lastMsg = messages[messages.length - 1];
  const userText = lastMsg?.parts?.find((p) => p.type === "text")?.text || "";

  const payload = parsePayload(userText);

  const context = payload?.context;
  const userRequest = payload?.userRequest || userText;
  const selectionMode = context?.mode === "selection";
  const selectedContent = context?.content || "";

  console.log(
    `[Agent Editor ${chatId}] Mode: ${context?.mode}, Request: ${userRequest}`,
  );

  const messageId = generateId();
  const reasoningId = `rs_${generateId()}`;
  const textId = `msg_${generateId()}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      sendSseEvent(controller, encoder, {
        type: "start",
        messageId,
        modelId: model,
      });
      await delay(50);
      sendSseEvent(controller, encoder, { type: "start-step" });
      await delay(50);

      const reasoningText = selectionMode
        ? `用户选中了一段文字："${selectedContent.slice(0, 30)}..."，请求是："${userRequest}"。我将生成多个改写方案供用户选择。`
        : `用户请求对全文进行处理："${userRequest}"。我将分析全文并提供修改建议。`;

      sendSseEvent(controller, encoder, {
        type: "reasoning-start",
        id: reasoningId,
      });
      await delay(30);

      for (const char of reasoningText) {
        sendSseEvent(controller, encoder, {
          type: "reasoning-delta",
          id: reasoningId,
          delta: char,
        });
        await delay(15);
      }

      sendSseEvent(controller, encoder, {
        type: "reasoning-end",
        id: reasoningId,
      });
      await delay(50);

      if (selectionMode) {
        const toolCallId = `call_${generateId()}`;
        const toolName = "suggest_rewrite";
        const suggestions = generateRewriteSuggestions(selectedContent, userRequest);

        sendSseEvent(controller, encoder, {
          type: "tool-input-start",
          toolCallId,
          toolName,
        });
        await delay(50);

        const inputJson = JSON.stringify({ suggestions });
        for (const char of inputJson) {
          sendSseEvent(controller, encoder, {
            type: "tool-input-delta",
            toolCallId,
            inputTextDelta: char,
          });
          await delay(10);
        }
        await delay(100);

        sendSseEvent(controller, encoder, {
          type: "tool-input-available",
          toolCallId,
          toolName,
          input: { suggestions },
        });
        await delay(200);

        sendSseEvent(controller, encoder, {
          type: "tool-output-available",
          toolCallId,
          output: { success: true, count: suggestions.length },
        });
        await delay(100);

        sendSseEvent(controller, encoder, { type: "text-start", id: textId });
        await delay(30);

        const responseText = `我为你生成了 ${suggestions.length} 个改写方案，请选择一个应用到编辑器中：`;

        for (const char of responseText) {
          sendSseEvent(controller, encoder, {
            type: "text-delta",
            id: textId,
            delta: char,
          });
          await delay(20);
        }

        sendSseEvent(controller, encoder, { type: "text-end", id: textId });
      } else {
        const fullText = selectedContent;
        const toolCallId = `call_${generateId()}`;
        const toolName = "suggest_edit";
        const edits = generateEditSuggestions(fullText, userRequest);

        sendSseEvent(controller, encoder, {
          type: "tool-input-start",
          toolCallId,
          toolName,
        });
        await delay(50);

        const inputJson = JSON.stringify({ suggestions: edits });
        for (const char of inputJson) {
          sendSseEvent(controller, encoder, {
            type: "tool-input-delta",
            toolCallId,
            inputTextDelta: char,
          });
          await delay(10);
        }
        await delay(100);

        sendSseEvent(controller, encoder, {
          type: "tool-input-available",
          toolCallId,
          toolName,
          input: { suggestions: edits },
        });
        await delay(200);

        sendSseEvent(controller, encoder, {
          type: "tool-output-available",
          toolCallId,
          output: { success: true, count: edits.length },
        });
        await delay(100);

        sendSseEvent(controller, encoder, { type: "text-start", id: textId });
        await delay(30);

        const responseText =
          edits.length > 0
            ? `我分析了全文内容，建议对以下 ${edits.length} 处进行修改：`
            : `我已阅读全文内容。关于你的请求"${userRequest}"，我的建议是：保持当前内容，它已经很好了。`;

        for (const char of responseText) {
          sendSseEvent(controller, encoder, {
            type: "text-delta",
            id: textId,
            delta: char,
          });
          await delay(20);
        }

        sendSseEvent(controller, encoder, { type: "text-end", id: textId });
      }

      await delay(50);

      sendSseEvent(controller, encoder, { type: "finish-step" });
      await delay(30);
      sendSseEvent(controller, encoder, { type: "finish", finishReason: "stop" });
      await delay(30);
      sendSseEvent(controller, encoder, "[DONE]");

      controller.close();
    },
  });

  return createSseResponse(stream);
}
