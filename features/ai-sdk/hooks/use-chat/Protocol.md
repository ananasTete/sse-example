# SSE 协议规范

本文档定义了 `useChat` hook 与后端 API 之间的 Server-Sent Events (SSE) 通信协议。

## 概述

客户端通过 POST 请求发送消息，服务器以 SSE 流的形式返回响应。每个事件通过 `data:` 前缀发送，格式为 JSON 对象（除结束标记外）。

## 请求格式

### Endpoint / Headers / Body

```
POST /api/chats/{chatId}
```

```
Content-Type: application/json
```

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

## 完整示例

服务器响应流示例：

```
data: {"type":"start","messageId":"1736589600000_abc123",model:"xxx"}

data: {"type":"start-step"}

// [推理开始]

data: {"type":"reasoning-start","id":"rs_001"}

// [推理内容]

data: {"type":"reasoning-delta","id":"rs_001","delta":"让"} 

data: {"type":"reasoning-delta","id":"rs_001","delta":"我"}

data: {"type":"reasoning-delta","id":"rs_001","delta":"思考..."}

// [推理结束]

data: {"type":"reasoning-end","id":"rs_001"}

// [text开始]

data: {"type":"text-start","id":"msg_001"}

// [text内容]

data: {"type":"text-delta","id":"msg_001","delta":"你好！"}

data: {"type":"text-delta","id":"msg_001","delta":"这是回复。"}

// [text结束]

data: {"type":"text-end","id":"msg_001"}

data: {"type":"finish-step"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]
```

---

## 工具调用（Tool Calling）

本协议支持 AI 模型调用外部工具（如天气查询、搜索、数据库操作等）。工具调用采用**服务端执行模式**，即工具在后端执行，前端仅接收状态更新和结果。

---

### 工具调用完整示例

```
data: {"type":"start","messageId":"xxx",model:"xxx"}

data: {"type":"start-step"}

data: {"type":"reasoning-start","id":"rs_001"}

data: {"type":"reasoning-delta","id":"rs_001","delta":"我需要查询天气..."}

data: {"type":"reasoning-end","id":"rs_001"}

// [工具调用开始]

data: {"type":"tool-input-start","toolCallId":"call_xxx","toolName":"weather"}

// [开始生成工具调用参数]

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"{\""}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"location"}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"\":\""}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"Bordeaux"}

data: {"type":"tool-input-delta","toolCallId":"call_xxx","inputTextDelta":"\"}"}

// [完成了参数生成，后端开始执行工具]

data: {"type":"tool-input-available","toolCallId":"call_xxx","toolName":"weather","input":{"location":"Bordeaux"}}

// [工具执行完成，返回结果]

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
