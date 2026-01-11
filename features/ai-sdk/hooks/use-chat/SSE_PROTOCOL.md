# SSE 协议规范

本文档定义了 `useChat` hook 与后端 API 之间的 Server-Sent Events (SSE) 通信协议。

## 概述

客户端通过 POST 请求发送消息，服务器以 SSE 流的形式返回响应。每个事件通过 `data:` 前缀发送，格式为 JSON 对象（除结束标记外）。

## 请求格式

### Endpoint

```
POST /api/chats/{chatId}
```

### Headers

```
Content-Type: application/json
```

### Body

```json
{
  "id": "chatId",
  "messages": [
    {
      "id": "msg_xxx",
      "role": "user" | "assistant",
      "parts": [
        { "type": "text", "text": "消息内容", "state": "done" }
      ],
      "createdAt": "2026-01-11T10:00:00.000Z",
      "chatId": "chatId"
    }
  ],
  "model": "gpt-3.5-turbo",
  "trigger": "submit-message" | "regenerate-message"
}
```

## 响应格式

### Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### 事件类型

所有事件格式为：`data: {JSON}\n\n`

---

## 事件生命周期

### 基本流程（无工具调用）

```
start → start-step → [reasoning-start → reasoning-delta* → reasoning-end] → text-start → text-delta* → text-end → finish-step → finish → [DONE]
```

### 带工具调用的流程

```
start → start-step → [reasoning] → [tool-input-start → tool-input-delta* → tool-input-available → tool-output-available] → [text] → finish-step → finish → [DONE]
```

---

## 事件详情

### 1. `start` - 消息开始

标记 AI 响应的开始，包含服务器分配的消息 ID。

```json
{
  "type": "start",
  "messageId": "1736589600000_abc123def456"
}
```

| 字段        | 类型      | 说明                     |
| ----------- | --------- | ------------------------ |
| `type`      | `"start"` | 事件类型                 |
| `messageId` | `string`  | 服务器分配的消息唯一标识 |

---

### 2. `start-step` - 步骤开始

标记一个处理步骤的开始。

```json
{
  "type": "start-step"
}
```

---

### 3. `reasoning-start` - 推理开始

标记推理/思考阶段的开始。

```json
{
  "type": "reasoning-start",
  "id": "rs_abc123"
}
```

| 字段   | 类型                | 说明             |
| ------ | ------------------- | ---------------- |
| `type` | `"reasoning-start"` | 事件类型         |
| `id`   | `string`            | 推理块的唯一标识 |

---

### 4. `reasoning-delta` - 推理增量

推理内容的增量更新，逐字符/逐词发送。

```json
{
  "type": "reasoning-delta",
  "id": "rs_abc123",
  "delta": "让"
}
```

| 字段    | 类型                | 说明            |
| ------- | ------------------- | --------------- |
| `type`  | `"reasoning-delta"` | 事件类型        |
| `id`    | `string`            | 对应的推理块 ID |
| `delta` | `string`            | 增量文本内容    |

---

### 5. `reasoning-end` - 推理结束

标记推理阶段的结束。

```json
{
  "type": "reasoning-end",
  "id": "rs_abc123"
}
```

---

### 6. `text-start` - 文本开始

标记正式回复文本的开始。

```json
{
  "type": "text-start",
  "id": "msg_xyz789"
}
```

| 字段   | 类型           | 说明             |
| ------ | -------------- | ---------------- |
| `type` | `"text-start"` | 事件类型         |
| `id`   | `string`       | 文本块的唯一标识 |

---

### 7. `text-delta` - 文本增量

正式回复的增量更新。

```json
{
  "type": "text-delta",
  "id": "msg_xyz789",
  "delta": "你好"
}
```

| 字段    | 类型           | 说明            |
| ------- | -------------- | --------------- |
| `type`  | `"text-delta"` | 事件类型        |
| `id`    | `string`       | 对应的文本块 ID |
| `delta` | `string`       | 增量文本内容    |

---

### 8. `text-end` - 文本结束

标记正式回复文本的结束。

```json
{
  "type": "text-end",
  "id": "msg_xyz789"
}
```

---

### 9. `finish-step` - 步骤结束

标记处理步骤的结束。

```json
{
  "type": "finish-step"
}
```

---

### 10. `finish` - 响应完成

标记整个响应的完成。

```json
{
  "type": "finish",
  "finishReason": "stop"
}
```

| 字段           | 类型       | 说明                                        |
| -------------- | ---------- | ------------------------------------------- |
| `type`         | `"finish"` | 事件类型                                    |
| `finishReason` | `string`   | 完成原因：`"stop"` / `"length"` / `"error"` |

---

### 11. `[DONE]` - 流结束

特殊标记，表示 SSE 流结束。这是唯一的非 JSON 格式事件。

```
data: [DONE]
```

---

## 客户端状态映射

| 事件              | 客户端 Part 状态变化                                       |
| ----------------- | ---------------------------------------------------------- |
| `reasoning-start` | 添加 `{ type: "reasoning", text: "", state: "streaming" }` |
| `reasoning-delta` | 更新最后一个 reasoning part 的 `text`                      |
| `reasoning-end`   | 将 reasoning part 的 `state` 设为 `"done"`                 |
| `text-start`      | 添加 `{ type: "text", text: "", state: "streaming" }`      |
| `text-delta`      | 更新最后一个 text part 的 `text`                           |
| `text-end`        | 将 text part 的 `state` 设为 `"done"`                      |

---

## 完整示例

服务器响应流示例：

```
data: {"type":"start","messageId":"1736589600000_abc123"}

data: {"type":"start-step"}

data: {"type":"reasoning-start","id":"rs_001"}

data: {"type":"reasoning-delta","id":"rs_001","delta":"让"}

data: {"type":"reasoning-delta","id":"rs_001","delta":"我"}

data: {"type":"reasoning-delta","id":"rs_001","delta":"思考..."}

data: {"type":"reasoning-end","id":"rs_001"}

data: {"type":"text-start","id":"msg_001"}

data: {"type":"text-delta","id":"msg_001","delta":"你好！"}

data: {"type":"text-delta","id":"msg_001","delta":"这是回复。"}

data: {"type":"text-end","id":"msg_001"}

data: {"type":"finish-step"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]
```

---

## 错误处理

如果发生错误，建议发送 `finish` 事件并设置 `finishReason: "error"`：

```json
{
  "type": "finish",
  "finishReason": "error",
  "error": {
    "code": "rate_limit_exceeded",
    "message": "请求频率过高，请稍后重试"
  }
}
```

---

## 工具调用（Tool Calling）

本协议支持 AI 模型调用外部工具（如天气查询、搜索、数据库操作等）。工具调用采用**服务端执行模式**，即工具在后端执行，前端仅接收状态更新和结果。

### 工具调用事件生命周期

```
tool-input-start → tool-input-delta* → tool-input-available → [后端执行工具] → tool-output-available
```

工具调用可以穿插在 reasoning 和 text 之间：

```
start → start-step → [reasoning] → tool-input-start → ... → tool-output-available → [text] → finish-step → finish → [DONE]
```

---

### 工具调用事件详情

#### 1. `tool-input-start` - 工具调用开始

AI 开始调用工具，标记工具调用的开始。

```json
{
  "type": "tool-input-start",
  "toolCallId": "call_ZdyKfjQzyQS47gGAEEzA6uX2",
  "toolName": "weather"
}
```

| 字段         | 类型                 | 说明                       |
| ------------ | -------------------- | -------------------------- |
| `type`       | `"tool-input-start"` | 事件类型                   |
| `toolCallId` | `string`             | 工具调用的唯一标识         |
| `toolName`   | `string`             | 工具名称（如 `"weather"`） |

---

#### 2. `tool-input-delta` - 参数增量

AI 正在流式生成工具调用的参数（JSON 字符串片段）。

```json
{
  "type": "tool-input-delta",
  "toolCallId": "call_ZdyKfjQzyQS47gGAEEzA6uX2",
  "inputTextDelta": "{\"location\":"
}
```

| 字段             | 类型                 | 说明               |
| ---------------- | -------------------- | ------------------ |
| `type`           | `"tool-input-delta"` | 事件类型           |
| `toolCallId`     | `string`             | 对应的工具调用 ID  |
| `inputTextDelta` | `string`             | 参数 JSON 文本片段 |

---

#### 3. `tool-input-available` - 参数完整可用

AI 完成了参数生成，后端开始执行工具。

```json
{
  "type": "tool-input-available",
  "toolCallId": "call_ZdyKfjQzyQS47gGAEEzA6uX2",
  "toolName": "weather",
  "input": {
    "location": "Bordeaux"
  }
}
```

| 字段         | 类型                     | 说明             |
| ------------ | ------------------------ | ---------------- |
| `type`       | `"tool-input-available"` | 事件类型         |
| `toolCallId` | `string`                 | 对应的工具调用ID |
| `toolName`   | `string`                 | 工具名称         |
| `input`      | `object`                 | 解析后的完整参数 |

---

#### 4. `tool-output-available` - 执行结果可用

工具执行完成，返回结果。

```json
{
  "type": "tool-output-available",
  "toolCallId": "call_ZdyKfjQzyQS47gGAEEzA6uX2",
  "output": {
    "location": "Bordeaux",
    "temperature": 22,
    "condition": { "text": "Foggy", "icon": "cloud-fog" }
  }
}
```

| 字段         | 类型                      | 说明             |
| ------------ | ------------------------- | ---------------- |
| `type`       | `"tool-output-available"` | 事件类型         |
| `toolCallId` | `string`                  | 对应的工具调用ID |
| `output`     | `any`                     | 工具执行结果     |

---

### 客户端状态映射

| 事件                    | 客户端 ToolCallPart 状态变化                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `tool-input-start`      | 添加 `{ type: "tool-call", toolCallId, toolName, state: "streaming-input", inputText: "" }` |
| `tool-input-delta`      | 更新对应 tool-call part 的 `inputText`                                                      |
| `tool-input-available`  | 设置 `state: "input-available"`，添加 `input` 字段                                          |
| `tool-output-available` | 设置 `state: "output-available"`，添加 `output` 字段                                        |

---

### 工具调用完整示例

```
data: {"type":"start","messageId":"xxx"}

data: {"type":"start-step"}

data: {"type":"reasoning-start","id":"rs_001"}

data: {"type":"reasoning-delta","id":"rs_001","delta":"我需要查询天气..."}

data: {"type":"reasoning-end","id":"rs_001"}

data: {"type":"tool-input-start","toolCallId":"call_xxx","toolName":"weather"}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"{\""}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"location"}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"\":\""}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"Bordeaux"}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"\"}"}

data: {"type":"tool-input-available","toolCallId":"call_xxx","toolName":"weather","input":{"location":"Bordeaux"}}

data: {"type":"tool-output-available","toolCallId":"call_xxx","output":{"location":"Bordeaux","temperature":22,"condition":{"text":"Foggy"}}}

data: {"type":"text-start","id":"msg_001"}

data: {"type":"text-delta","id":"msg_001","delta":"根据查询结果，Bordeaux天气..."}

data: {"type":"text-end","id":"msg_001"}

data: {"type":"finish-step"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]
```

---

## 为什么要返回参数生成过程？

你可能会问：既然工具是在后端执行的，直接返回执行结果不就好了，为什么要流式返回 `tool-input-delta` 参数生成过程？

这是一个**用户体验（UX）设计选择**，而非技术必需。返回参数生成过程有以下几个重要原因：

### 1. 消除等待焦虑

工具执行可能需要较长时间（API 调用、数据库查询等）。如果用户看到参数正在流式生成：

```
🔧 weather
   参数: {"location": "B... Bo... Bordeaux"}
   状态: 生成中...
```

他们会感知到"AI 正在思考和行动"，而不是"系统是不是卡住了？"

### 2. 透明度与信任

用户可以看到 AI **决定调用什么工具、传了什么参数**：

- **发现误解**：用户说"查北京天气"，如果看到 `"location": "Beijing, USA"` 就知道需要纠正
- **建立信任**：用户明确知道 AI 在做什么，而非"黑箱操作"
- **方便调试**：开发者可以在 UI 中验证参数是否正确

### 3. 为交互预留空间

虽然当前是自动执行，但这种协议设计允许未来扩展：

- **执行前确认**：在 `tool-input-available` 后暂停，让用户确认"是否执行？"
- **参数修改**：让用户在执行前调整参数
- **混合执行**：某些工具后端执行，某些工具前端执行

### 4. 展示复杂参数的生成过程

当工具需要多个参数时，流式展示让用户理解 AI 的"思考过程"：

```
搜索航班:
  出发地: Shanghai →
  目的地: Tokyo →
  日期: 2026-02-01
```

---

### 简化选项

如果你的应用场景不需要展示参数生成过程，可以简化协议：

- 只发送 `tool-input-available` 和 `tool-output-available`
- 跳过所有 `tool-input-delta` 事件

但对于大多数面向用户的 AI 产品，展示这个过程能显著提升用户体验。
