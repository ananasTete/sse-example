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
  // 简单匹配一些城市名，实际应用中应使用 NLP
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
  return "Bordeaux"; // 默认城市
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const body = await req.json();
  const { messages, model } = body;

  // 解析最后一条消息
  const lastMsg = messages[messages.length - 1];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userText =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastMsg?.parts?.find((p: any) => p.type === "text")?.text || "";

  console.log(`[Chat ${chatId}] User said: ${userText}`);

  const messageId = generateId();
  const reasoningId = `rs_${generateId()}`;
  const textId = `msg_${generateId()}`;

  // 判断是否为天气查询
  const shouldUseWeatherTool = isWeatherQuery(userText);
  const city = extractCity(userText);

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

      if (shouldUseWeatherTool) {
        // === 天气工具调用流程 ===
        const toolCallId = `call_${generateId()}`;
        const toolName = "weather";

        // 推理阶段
        const reasoningText = `用户想查询天气信息，我需要调用天气工具来获取 ${city} 的天气数据。`;
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

        // 工具调用开始
        sendEvent(controller, encoder, {
          type: "tool-input-start",
          toolCallId,
          toolName,
        });
        await delay(50);

        // 流式生成工具参数
        const inputJson = JSON.stringify({ location: city });
        for (const char of inputJson) {
          sendEvent(controller, encoder, {
            type: "tool-input-delta",
            toolCallId,
            inputTextDelta: char,
          });
          await delay(30);
        }
        await delay(100);

        // 工具参数完整可用
        sendEvent(controller, encoder, {
          type: "tool-input-available",
          toolCallId,
          toolName,
          input: { location: city },
        });
        await delay(500); // 模拟工具执行时间

        // 工具执行结果
        const weatherOutput = { ...mockWeatherData, location: city };
        sendEvent(controller, encoder, {
          type: "tool-output-available",
          toolCallId,
          output: weatherOutput,
        });
        await delay(100);

        // 基于工具结果生成文本回复
        sendEvent(controller, encoder, { type: "text-start", id: textId });
        await delay(30);

        const responseText = `根据天气查询结果，${city} 现在的天气是 ${weatherOutput.condition.text}，温度 ${weatherOutput.temperature}°C。今天最高温度 ${weatherOutput.temperatureHigh}°C，最低温度 ${weatherOutput.temperatureLow}°C。湿度 ${weatherOutput.humidity}%，风速 ${weatherOutput.windSpeed} km/h。`;

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
        // === 普通对话流程 ===
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

        // 推理阶段
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
          await delay(20);
        }

        sendEvent(controller, encoder, {
          type: "reasoning-end",
          id: reasoningId,
        });
        await delay(50);

        // 文本阶段
        sendEvent(controller, encoder, { type: "text-start", id: textId });
        await delay(30);

        for (const char of responseText) {
          sendEvent(controller, encoder, {
            type: "text-delta",
            id: textId,
            delta: char,
          });
          await delay(30);
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
