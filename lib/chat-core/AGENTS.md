# chat-core

协议无关的聊天流式通信核心库，分为三层：`server`（服务端产出）、`client`（客户端消费）、`ui`（React 渲染）。

## 目录结构

```
lib/chat-core/
├── types.ts              # 所有共享类型（协议层 + 领域层）
├── index.ts              # 统一 re-export
├── server/
│   ├── sse.ts            # SSE 响应工具（headers、sendSseFrame、createSseResponse）
│   ├── patch-emitter.ts  # PatchEmitter：将 AI 流事件序列化为 SSE patch 帧
│   ├── stream-bridge.ts  # bridgeAIStreamToPatches：把 AI SDK fullStream 桥接到 PatchEmitter
│   ├── citation.ts       # citation 标签归一化与流式缓冲（extractFlushableCitationMarkdown）
│   └── tools/
│       └── web-search.ts # createWebSearchTool + Tavily 搜索实现 + buildSearchSystemPrompt
├── client/
│   ├── stream-parser.ts  # createPatchStreamParser：SSE 事件 → immer 状态更新
│   ├── patch-apply.ts    # applyPathPatch：路径寻址的 add/append/set 操作
│   ├── stream-consumer.ts# consumePatchStream：ReadableStream → parser.feed 循环
│   └── citation-utils.ts # extractCitationsFromBlocks：从 blocks 提取 MessageCitation[]
└── ui/
    ├── chat-response.tsx  # ChatResponse（Streamdown Markdown 渲染 + citation 标签支持）
    ├── block-renderer.tsx # BlockRenderer：按 block.type/tool_name 分发渲染
    ├── search-block.tsx   # SearchBlockView：web_search 工具调用的 UI
    └── tool-block.tsx     # GenericToolView：通用工具调用折叠面板
```

## 核心数据流

```
服务端
  AI SDK fullStream
    → bridgeAIStreamToPatches (stream-bridge.ts)
      → PatchEmitter (patch-emitter.ts)
        → sendSseFrame (sse.ts)
          → SSE Response

客户端
  SSE Response
    → consumePatchStream (stream-consumer.ts)
      → createPatchStreamParser (stream-parser.ts)
        → applyPathPatch (patch-apply.ts)
          → immer 状态更新 → React 渲染
```

## 关键类型（types.ts）

- **PatchEnvelope / PatchOp**：SSE 默认帧格式，`o`(op) + `p`(path) + `v`(value)，支持 sticky 压缩（省略重复的 o/p）
- **BatchItem**：`batch` op 的子项，继承父级 o/p
- **PatchContext**：客户端维护的 sticky 上下文 `{ lastOp, lastPath }`
- **CoreMessage / Block**：领域消息模型，`blocks` 数组包含 `TextBlock | ToolCallBlock | ReasoningBlock`
- **ReadyPayload / DonePayload / ErrorPayload / SessionPayload**：具名 SSE 事件的 payload 类型
- **SearchResultPayload / MessageCitation**：搜索结果与引用类型

## 各文件职责速查

| 文件 | 何时需要读 |
|------|-----------|
| `types.ts` | 需要了解协议或领域类型时必读 |
| `server/patch-emitter.ts` | 服务端如何把状态变更序列化为 SSE |
| `server/stream-bridge.ts` | 如何将 AI SDK stream 接入 SSE 管道；含 tool-call/tool-result/finish 处理逻辑 |
| `server/citation.ts` | citation 标签的流式缓冲与归一化规则 |
| `server/tools/web-search.ts` | Tavily 搜索工具配置、`createWebSearchTool`、`buildSearchSystemPrompt` |
| `client/stream-parser.ts` | 客户端解析 SSE 帧并驱动 immer 状态更新的完整逻辑 |
| `client/patch-apply.ts` | 路径寻址的 patch 操作实现细节 |
| `client/stream-consumer.ts` | 仅需了解如何消费 Response body 时读（极简） |
| `client/citation-utils.ts` | 从 blocks 提取引用列表 |
| `ui/chat-response.tsx` | Markdown 渲染组件，含 citation 标签渲染与 Streamdown 插件配置 |
| `ui/block-renderer.tsx` | block 渲染分发逻辑 |
| `ui/search-block.tsx` | 搜索结果 UI，支持 `search` 和 `tool_call(web_search)` 两种 block 格式 |
| `ui/tool-block.tsx` | 通用工具调用折叠面板 |

## SSE 帧协议

**具名事件**（`event:` 字段存在）：`ready` | `upsert_message` | `update_session` | `done` | `error`

**默认事件（patch 帧）**：
```
data: {"o":"append","p":"blocks/0/content","v":"hello"}
data: {"v":" world"}   ← 省略 o/p，沿用上一帧（sticky 压缩）
data: {"o":"batch","p":"blocks/1","v":[{"p":"status","o":"set","v":"FINISHED"}]}
```

## 使用模式

**服务端**：
```ts
import { createPatchEmitter, bridgeAIStreamToPatches, createSseResponse } from "@/lib/chat-core";

const stream = new ReadableStream({ start(controller) {
  const emitter = createPatchEmitter(controller);
  emitter.sendReady({ response_message_id, user_message_id, session_id });
  await bridgeAIStreamToPatches(aiFullStream, { emitter, responseMessageId });
  emitter.sendDone({ status: "finished" });
  controller.close();
}});
return createSseResponse(stream);
```

**客户端**：
```ts
import { createPatchStreamParser, consumePatchStream } from "@/lib/chat-core";

const patchContext = { lastOp: null, lastPath: null };
const parser = createPatchStreamParser({ updateState, resolveMessage, patchContext, onDone });
await consumePatchStream(response, parser);
```
