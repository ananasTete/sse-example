import { NextRequest } from "next/server";
import { chatStore } from "@/lib/chat-store";
import { Message, MessagePart } from "@/features/ai-sdk/hooks/use-chat/types";

export const runtime = "nodejs";

interface RequestBody {
  messages: Message[];
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

const normalizePartsForStorage = (parts: MessagePart[]): MessagePart[] =>
  parts.map((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return {
        ...part,
        state: "done" as const,
      };
    }
    return part;
  });

// 模拟天气数据
const mockWeatherData = {
  location: "Bordeaux",
  temperature: 22,
  temperatureHigh: 26,
  temperatureLow: 16,
  condition: {
    text: "Foggy",
    icon: "cloud-fog",
  },
  humidity: 51,
  windSpeed: 9,
  dailyForecast: [
    {
      day: "Today",
      high: 21,
      low: 12,
      condition: { text: "Partly Cloudy", icon: "cloud-sun" },
    },
    {
      day: "Tomorrow",
      high: 25,
      low: 13,
      condition: { text: "Cloudy", icon: "cloud" },
    },
    {
      day: "Thu",
      high: 26,
      low: 18,
      condition: { text: "Rainy", icon: "cloud-rain" },
    },
    {
      day: "Fri",
      high: 25,
      low: 12,
      condition: { text: "Foggy", icon: "cloud-fog" },
    },
    {
      day: "Sat",
      high: 26,
      low: 19,
      condition: { text: "Sunny", icon: "sun" },
    },
  ],
};

// 检查是否是天气查询
const isWeatherQuery = (text: string) => {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("天气") ||
    lowerText.includes("weather") ||
    lowerText.includes("气温") ||
    lowerText.includes("温度")
  );
};

// 从用户消息中提取城市名（简单实现）
const extractCity = (text: string) => {
  const cities = [
    "Bordeaux",
    "Paris",
    "北京",
    "上海",
    "广州",
    "深圳",
    "杭州",
    "New York",
    "London",
    "Tokyo",
  ];
  for (const city of cities) {
    if (text.toLowerCase().includes(city.toLowerCase())) {
      return city;
    }
  }
  return "Bordeaux";
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;

  const chat = await chatStore.getChat(chatId);
  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const messages = await chatStore.listMessages(chatId);

  return Response.json({ chat, messages });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = (await req.json()) as { title?: string | null };

  const updated = await chatStore.updateChat(chatId, {
    title: body.title,
  });

  if (!updated) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json({ chat: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const deleted = await chatStore.deleteChat(chatId);

  if (!deleted) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = (await req.json()) as RequestBody;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const model = body.model || "mock-model";

  if (messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  await chatStore.syncMessages(chatId, messages);

  const lastMsg = messages[messages.length - 1];
  const userText =
    lastMsg?.parts?.find((part) => part.type === "text")?.text ?? "";

  console.log(`[Chat ${chatId}] User said: ${userText}`);

  const messageId = generateId();
  const reasoningId = `rs_${generateId()}`;
  const textId = `msg_${generateId()}`;

  const shouldUseWeatherTool = isWeatherQuery(userText);
  const city = extractCity(userText);

  const assistantParts: MessagePart[] = [];
  let isCancelled = false;
  let isPersisted = false;

  const persistAssistantMessage = async (
    status: "done" | "aborted" | "error"
  ) => {
    if (isPersisted) return;
    isPersisted = true;

    await chatStore.createMessage({
      id: messageId,
      chatId,
      role: "assistant",
      model,
      status,
      parts: normalizePartsForStorage(assistantParts),
      createdAt: new Date().toISOString(),
    });
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const safeSend = (data: object | string) => {
        if (isCancelled) return false;
        try {
          sendEvent(controller, encoder, data);
          return true;
        } catch {
          isCancelled = true;
          return false;
        }
      };

      try {
        if (!safeSend({ type: "start", messageId, modelId: model })) {
          await persistAssistantMessage("aborted");
          return;
        }
        await delay(50);

        assistantParts.push({ type: "step-start" });
        if (!safeSend({ type: "start-step" })) {
          await persistAssistantMessage("aborted");
          return;
        }
        await delay(50);

        if (shouldUseWeatherTool) {
          const toolCallId = `call_${generateId()}`;
          const toolName = "weather";
          const reasoningText = `用户想查询天气信息，我需要调用天气工具来获取 ${city} 的天气数据。`;

          assistantParts.push({
            type: "reasoning",
            text: "",
            state: "streaming",
          });

          if (!safeSend({ type: "reasoning-start", id: reasoningId })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(30);

          for (const char of reasoningText) {
            const reasoningPart = assistantParts[assistantParts.length - 1];
            if (reasoningPart.type === "reasoning") {
              reasoningPart.text += char;
            }

            if (!safeSend({ type: "reasoning-delta", id: reasoningId, delta: char })) {
              await persistAssistantMessage("aborted");
              return;
            }
            await delay(15);
          }

          const reasoningPart = assistantParts[assistantParts.length - 1];
          if (reasoningPart.type === "reasoning") {
            reasoningPart.state = "done";
          }

          if (!safeSend({ type: "reasoning-end", id: reasoningId })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(50);

          assistantParts.push({
            type: "tool-call",
            toolCallId,
            toolName,
            state: "streaming-input",
            inputText: "",
          });

          if (!safeSend({ type: "tool-input-start", toolCallId, toolName })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(50);

          const inputJson = JSON.stringify({ location: city });
          for (const char of inputJson) {
            const toolPart = assistantParts[assistantParts.length - 1];
            if (toolPart.type === "tool-call") {
              toolPart.inputText = (toolPart.inputText ?? "") + char;
            }

            if (
              !safeSend({
                type: "tool-input-delta",
                toolCallId,
                inputTextDelta: char,
              })
            ) {
              await persistAssistantMessage("aborted");
              return;
            }
            await delay(30);
          }
          await delay(100);

          const toolPart = assistantParts[assistantParts.length - 1];
          if (toolPart.type === "tool-call") {
            toolPart.state = "input-available";
            toolPart.input = { location: city };
          }

          if (
            !safeSend({
              type: "tool-input-available",
              toolCallId,
              toolName,
              input: { location: city },
            })
          ) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(500);

          const weatherOutput = { ...mockWeatherData, location: city };
          if (toolPart.type === "tool-call") {
            toolPart.state = "output-available";
            toolPart.output = weatherOutput;
          }

          if (
            !safeSend({
              type: "tool-output-available",
              toolCallId,
              output: weatherOutput,
            })
          ) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(100);

          assistantParts.push({
            type: "text",
            text: "",
            state: "streaming",
          });

          if (!safeSend({ type: "text-start", id: textId })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(30);

          const responseText = `根据天气查询结果，${city} 现在的天气是 ${weatherOutput.condition.text}，温度 ${weatherOutput.temperature}°C。今天最高温度 ${weatherOutput.temperatureHigh}°C，最低温度 ${weatherOutput.temperatureLow}°C。湿度 ${weatherOutput.humidity}%，风速 ${weatherOutput.windSpeed} km/h。`;

          for (const char of responseText) {
            const textPart = assistantParts[assistantParts.length - 1];
            if (textPart.type === "text") {
              textPart.text += char;
            }

            if (!safeSend({ type: "text-delta", id: textId, delta: char })) {
              await persistAssistantMessage("aborted");
              return;
            }
            await delay(20);
          }

          const textPart = assistantParts[assistantParts.length - 1];
          if (textPart.type === "text") {
            textPart.state = "done";
          }

          if (!safeSend({ type: "text-end", id: textId })) {
            await persistAssistantMessage("aborted");
            return;
          }
        } else {
          const reasoningText = `让我思考一下这个问题...用户说的是: "${userText}"。我需要理解这个请求并给出合适的回复。`;
          const responseText = `你好！我收到了你的消息："${userText}"

## 📝 Markdown 渲染演示

这是一个**粗体文本**，这是*斜体文本*，这是~~删除线~~。

### 🚀 代码示例

行内代码：\`const greeting = "Hello World"\`

代码块：

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const fetchUser = async (id: number): Promise<User> => {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
};
\`\`\`

### 📋 列表

**无序列表：**
- 第一项内容
- 第二项内容
  - 嵌套子项 A
  - 嵌套子项 B
- 第三项内容

**有序列表：**
1. 步骤一：安装依赖
2. 步骤二：配置环境
3. 步骤三：启动服务

### 📊 表格

| 功能 | 状态 | 说明 |
|------|------|------|
| Markdown 渲染 | ✅ 已完成 | 支持完整语法 |
| 流式输出 | ✅ 已完成 | 平滑动画效果 |
| 代码高亮 | ✅ 已完成 | 多语言支持 |

### 💬 引用

> 这是一段引用文本。
> 可以用来展示重要信息或名人名言。

### 🔗 链接

[访问 GitHub](https://github.com)

---

💡 **提示**：你可以问我"Bordeaux 的天气怎么样？"来测试工具调用功能。`;

          assistantParts.push({
            type: "reasoning",
            text: "",
            state: "streaming",
          });

          if (!safeSend({ type: "reasoning-start", id: reasoningId })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(30);

          for (const char of reasoningText) {
            const reasoningPart = assistantParts[assistantParts.length - 1];
            if (reasoningPart.type === "reasoning") {
              reasoningPart.text += char;
            }

            if (!safeSend({ type: "reasoning-delta", id: reasoningId, delta: char })) {
              await persistAssistantMessage("aborted");
              return;
            }
            await delay(20);
          }

          const reasoningPart = assistantParts[assistantParts.length - 1];
          if (reasoningPart.type === "reasoning") {
            reasoningPart.state = "done";
          }

          if (!safeSend({ type: "reasoning-end", id: reasoningId })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(50);

          assistantParts.push({
            type: "text",
            text: "",
            state: "streaming",
          });

          if (!safeSend({ type: "text-start", id: textId })) {
            await persistAssistantMessage("aborted");
            return;
          }
          await delay(30);

          for (const char of responseText) {
            const textPart = assistantParts[assistantParts.length - 1];
            if (textPart.type === "text") {
              textPart.text += char;
            }

            if (!safeSend({ type: "text-delta", id: textId, delta: char })) {
              await persistAssistantMessage("aborted");
              return;
            }
            await delay(30);
          }

          const textPart = assistantParts[assistantParts.length - 1];
          if (textPart.type === "text") {
            textPart.state = "done";
          }

          if (!safeSend({ type: "text-end", id: textId })) {
            await persistAssistantMessage("aborted");
            return;
          }
        }

        await delay(50);
        if (!safeSend({ type: "finish-step" })) {
          await persistAssistantMessage("aborted");
          return;
        }
        await delay(30);

        if (!safeSend({ type: "finish", finishReason: "stop" })) {
          await persistAssistantMessage("aborted");
          return;
        }
        await delay(30);

        if (!safeSend("[DONE]")) {
          await persistAssistantMessage("aborted");
          return;
        }

        controller.close();
        await persistAssistantMessage("done");
      } catch (err) {
        console.error(`[Chat ${chatId}] stream error`, err);

        if (!isCancelled) {
          try {
            safeSend({
              type: "finish",
              finishReason: "error",
              error: {
                message: err instanceof Error ? err.message : "Unknown error",
              },
            });
            safeSend("[DONE]");
            controller.close();
          } catch {
            // noop
          }
        }

        await persistAssistantMessage(isCancelled ? "aborted" : "error");
      }
    },
    async cancel() {
      isCancelled = true;
      await persistAssistantMessage("aborted");
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
