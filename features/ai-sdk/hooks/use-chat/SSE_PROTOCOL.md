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

```
start → start-step → [reasoning-start → reasoning-delta* → reasoning-end] → text-start → text-delta* → text-end → finish-step → finish → [DONE]
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
