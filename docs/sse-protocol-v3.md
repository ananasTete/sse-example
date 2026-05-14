# SSE Protocol v3：隐式上下文 + path-based patch 协议

> 本文档定义 chat-core 下一代 SSE 协议设计。v3 基于"一条流只产出一条 assistant message"的现实约束，采用隐式 message 上下文 + 显式 op + index-based path + context-sticky 压缩，实现极致简洁与健壮性的平衡。
>
> **不向后兼容 v2**。`target` 对象、block id、旧 MutationEnvelope 将被完全替换。

---

## 1. 协议设计

### 1.1 设计原则

| 原则                                | 说明                                                            |
| ----------------------------------- | --------------------------------------------------------------- |
| **一条流 = 一条消息**               | ready 事件建立唯一的 session + message 上下文，后续帧不重复声明 |
| **显式 op，隐式 target**            | 每帧都有明确的操作类型（或继承），但不需要声明操作哪个实体      |
| **path-based 寻址**                 | 用 `/` 分隔的路径从 message 根定位到目标属性，数组用 index      |
| **block 无 id**                     | block 用数组索引定位，不分配独立 id                             |
| **add ≠ append**                    | `add` = 往数组推入新元素；`append` = 往字符串追加内容           |
| **named event 处理非 message 操作** | session 更新、生命周期信号用独立 SSE event type                 |

### 1.2 SSE Event Types

| 类别                | SSE event 字段                                                                                                           | 说明                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **生命周期/元数据** | `event: ready` / `event: upsert_message` / `event: update_session` / `event: done` / `event: error` / `event: keepalive` | 每种信号独立命名，payload 形状各异 |
| **内容变更**        | 无 `event:` 字段（SSE 默认事件）                                                                                         | 统一的 `o/p/v` 结构                |

### 1.3 Named Events

| SSE event               | payload                                                | 说明                                               |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `event: ready`          | `{ response_message_id, user_message_id, session_id }` | 建立流上下文绑定                                   |
| `event: upsert_message` | `{ ...message 完整快照 }`                              | 创建或覆盖 assistant message（首次 + resume 统一） |
| `event: update_session` | `{ title?, updated_at? }`                              | session 元数据更新                                 |
| `event: done`           | `{ status }`                                           | run 结束                                           |
| `event: error`          | `{ message, code? }`                                   | run 异常终止                                       |
| `event: keepalive`      | `{}`                                                   | 心跳保活                                           |

#### `ready` 事件说明

- `response_message_id`：建立 run ↔ message 绑定
- `user_message_id`：客户端用于将乐观更新的用户消息替换为服务端真实 ID
- `session_id`：客户端可校验当前流归属的会话

#### `upsert_message` 事件说明

- payload 是完整的 message 对象（含 blocks 数组当前状态）
- 客户端收到后无条件用此快照覆盖本地 message 状态
- 首次连接：本地无 message → 创建
- resume 连接：本地已有 WIP message → 用服务端最新快照覆盖
- 语义是 upsert，客户端不需要判断"是否已存在"

#### 为什么 session 更新用 named event？

session 更新在整个流中只出现 2-3 次，为它引入 named event 的成本极低，但好处是：

- 不需要在 path 体系里表达"跳出 message 操作 session"
- 客户端 handler 天然隔离，不会和 message patch 混淆

### 1.4 内容变更事件（默认事件）

#### Envelope 字段

```ts
interface PatchEnvelope {
  o?: PatchOp; // 操作类型（支持 sticky 省略）
  p?: string; // 路径（支持 sticky 省略）
  v: unknown; // 载荷
}
```

#### Operation 类型

```ts
type PatchOp = "add" | "append" | "set" | "batch";
```

| op | 语义 | 典型场景 |
| -------- | ----------------------- | ----------------------------------------- |
| `add` | 往数组推入新元素 | 新增 block 到 `blocks` |
| `append` | 往字符串追加内容 | 追加文本到 `blocks/0/content` |
| `set` | 设置属性值 | 设置 `status`、`output` |
| `batch` | 原子性批量操作 | 同时更新多个属性，如 token_usage + status |

#### Batch 操作

`batch` 允许一帧内原子性地 apply 多个 patch，`v` 为 `BatchItem[]`：

```ts
interface BatchItem {
  o?: Exclude<PatchOp, "batch">; // 省略时继承父帧 sticky lastOp
  p?: string;                    // 省略时继承父帧 p
  v: unknown;
}
```

示例：

```
data: {"o":"batch","p":"","v":[{"p":"accumulated_token_usage","v":60},{"p":"status","v":"FINISHED"}]}
```

规则：
- `batch` 不可嵌套（`BatchItem.o` 不允许为 `"batch"`）
- 子 item 省略 `o` 时，继承父帧 sticky 的 `lastOp`（若 lastOp 为 `batch` 则无效，子 item 必须显式指定 `o`）
- 子 item 省略 `p` 时，继承父帧的 `p`
- `batch` 本身参与 sticky 上下文更新（`lastOp = "batch"`, `lastPath = p`）

#### Path 语法

`p` 使用 `/` 分隔，从 message 根开始定位：

| path                        | 语义                                    |
| --------------------------- | --------------------------------------- |
| `""`                        | message 自身（用于 set message 级属性） |
| `"status"`                  | message.status                          |
| `"blocks"`                  | message.blocks 数组                     |
| `"blocks/0/content"`        | 第 1 个 block 的 content                |
| `"blocks/1/output"`         | 第 2 个 block 的 output                 |
| `"blocks/1/status"`         | 第 2 个 tool_call block 的 status       |
| `"accumulated_token_usage"` | message 级属性                          |

数组定位使用数字索引。SSE 是服务端单向有序推送，索引是确定性的。

### 1.5 Context-Sticky 压缩规则

> 当连续默认事件的 `o` 和 `p` 均与上一条相同时，可省略。

**规则：**

- 继承源只能是上一条默认事件，named event 不参与继承链也不重置继承状态
- 第一条默认事件必须包含完整的 `o` 和 `p`
- 客户端必须同时支持完整和省略两种格式

**压缩示例：**

```
data: {"o":"append","p":"blocks/0/content","v":"你好"}       ← 完整
data: {"v":"世界"}                                           ← 省略 o 和 p
data: {"v":"！"}                                             ← 省略 o 和 p
data: {"o":"set","p":"blocks/1/status","v":"FINISHED"}       ← o/p 变化，完整发送
```

### 1.6 业务对象

#### Message

```ts
interface Message {
  message_id: number;
  parent_id: number | null;
  model: string;
  role: "ASSISTANT";
  status: "WIP" | "FINISHED" | "FAILED";
  thinking_enabled: boolean;
  ban_edit: boolean;
  ban_regenerate: boolean;
  incomplete_message: string | null;
  accumulated_token_usage: number;
  feedback: unknown;
  inserted_at: number;
  search_enabled: boolean;
  blocks: Block[];
  conversation_mode: string;
  has_pending_block: boolean;
  auto_continue: boolean;
}
```

#### Block（无 id）

```ts
type Block = TextBlock | ToolCallBlock | ReasoningBlock | ErrorBlock;

type BlockStatus = "WIP" | "FINISHED" | "FAILED";

interface TextBlock {
  type: "text";
  content: string;
  references: Array<Record<string, unknown>>;
}

interface ToolCallBlock {
  type: "tool_call";
  tool_name: string;
  tool_call_id: string;
  status: BlockStatus;
  input: unknown[];
  output: unknown[];
}

interface WebSearchBlock extends ToolCallBlock {
  tool_name: "web_search";
  input: SearchQueryPayload[];
  output: SearchResultPayload[];
}

interface ReasoningBlock {
  type: "reasoning";
  content: string;
}

interface ErrorBlock {
  type: "error";
  message: string;
  code?: string;
}
```

#### 状态枚举规范

协议中存在三层状态，使用不同 casing 以明确区分：

```ts
// 业务层状态（持久化，大写）—— message 与 tool_call block 使用
type MessageStatus = "WIP" | "FINISHED" | "FAILED";
type BlockStatus = "WIP" | "FINISHED" | "FAILED";

// 协议层 run lifecycle（小写）—— 出现在 done event 的 status 字段
type RunStatus = "finished" | "failed" | "cancelled";
```

| 层级             | 枚举值                              | 出现位置                                                     |
| ---------------- | ----------------------------------- | ------------------------------------------------------------ |
| message.status   | `WIP` / `FINISHED` / `FAILED`       | `upsert_message` payload、patch `set status`                 |
| tool_call.status | `WIP` / `FINISHED` / `FAILED`       | `add` tool_call block 时的初始值、patch `set blocks/N/status` |
| done.status      | `finished` / `failed` / `cancelled` | `event: done` payload                                        |

### 1.7 刷新后重新接入

页面刷新后，前端通过 REST API 拉取会话历史。发现 `status: "WIP"` 的 assistant message 时，使用 session_id + message_id 打开接入流：

```http
POST /api/v0/chat/resume_stream
Content-Type: application/json

{ "chat_session_id": "xxx", "message_id": 2 }
```

服务端按 run 状态处理：

| run 状态    | 服务端行为                                                              |
| ----------- | ----------------------------------------------------------------------- |
| 还在跑      | `ready` → `upsert_message(status: "WIP", 当前快照)` → 后续增量 → `done` |
| 已完成      | `ready` → `upsert_message(status: "FINISHED", 最终快照)` → `done`       |
| 已失败/过期 | `ready` → `upsert_message(status: "FAILED", 最终快照)` → `error`        |

**客户端规则：**

- 收到 `upsert_message` 后以快照状态为准，无条件覆盖本地 message 状态
- 如果快照 status 已经是 `FINISHED` 或 `FAILED`，不再期待后续增量帧
- `error` 事件提供附加错误信息用于展示，不承担状态变更职责
- 即使 `error` 事件因网络问题丢失，message 状态也已通过 `upsert_message` 收敛到终态

---

## 2. 完整 SSE 消息案例

### 2.1 场景

用户在搜索模式下提问"DeepSeek 最新模型"，assistant 先输出引导文本，调用 `web_search` 工具，再基于搜索结果生成最终回复。

### 2.2 完整 SSE 流

```
event: ready
data: {"response_message_id":2,"user_message_id":1,"session_id":"session_x7k9"}

event: update_session
data: {"updated_at":1778548419.388}

event: upsert_message
data: {"message_id":2,"parent_id":1,"model":"","role":"ASSISTANT","thinking_enabled":false,"ban_edit":false,"ban_regenerate":false,"status":"WIP","incomplete_message":null,"accumulated_token_usage":0,"feedback":null,"inserted_at":1778548419.387,"search_enabled":true,"blocks":[],"conversation_mode":"SEARCH","has_pending_block":false,"auto_continue":false}

data: {"o":"add","p":"blocks","v":{"type":"text","content":"","references":[]}}

data: {"o":"append","p":"blocks/0/content","v":"我来"}

data: {"v":"搜索"}

data: {"v":"一下"}

data: {"v":" DeepSeek"}

data: {"v":" 最新的"}

data: {"v":"模型"}

data: {"v":"信息。"}

data: {"o":"add","p":"blocks","v":{"type":"tool_call","tool_name":"web_search","tool_call_id":"call_00_OSj24csm7SsQjdyR8GJZ8930","status":"WIP","input":[{"query":"DeepSeek 最新模型 2025"}],"output":[]}}

data: {"o":"set","p":"blocks/1/output","v":[{"url":"https://example.com","title":"DeepSeek-V4 发布","snippet":"...","cite_index":1}]}

data: {"o":"set","p":"blocks/1/status","v":"FINISHED"}

data: {"o":"add","p":"blocks","v":{"type":"text","content":"","references":[]}}

data: {"o":"append","p":"blocks/2/content","v":"根据搜索结果，DeepSeek 最新的模型是 **DeepSeek-V4**"}

data: {"v":"，于 2026年4月24日 发布预览版。"}

data: {"v":"\n\n## 核心亮点\n1. 超长上下文：1M Token"}

data: {"v":"\n2. 双模式支持\n3. Agent 能力大幅增强"}

data: {"o":"set","p":"accumulated_token_usage","v":10329}

data: {"o":"set","p":"status","v":"FINISHED"}

event: update_session
data: {"updated_at":1778548425.123,"title":"DeepSeek 最新模型"}

event: done
data: {"status":"finished"}
```

### 2.3 压缩效果说明

| 片段                        | 是否省略 o/p            | 原因                        |
| --------------------------- | ----------------------- | --------------------------- |
| block_0 第一段文本 `"我来"` | 完整发送                | 首次出现该 path             |
| block_0 后续文本            | 省略 o/p                | 连续 append 同一 path       |
| block_1 add                 | 完整发送                | o 和 p 都变了               |
| block_1 output              | 完整发送                | p 变了                      |
| block_1 status              | 省略 p 中的 target 部分 | o 相同但 p 变了，需完整发送 |
| block_2 文本追加            | 首帧完整，后续省略      | 连续 append                 |
| message status              | 完整发送                | p 变了                      |

### 2.4 最终状态快照

客户端按序应用所有事件后，应得到：

```json
{
  "message_id": 2,
  "parent_id": 1,
  "model": "",
  "role": "ASSISTANT",
  "status": "FINISHED",
  "blocks": [
    {
      "type": "text",
      "content": "我来搜索一下 DeepSeek 最新的模型信息。",
      "references": []
    },
    {
      "type": "tool_call",
      "tool_name": "web_search",
      "tool_call_id": "call_00_OSj24csm7SsQjdyR8GJZ8930",
      "status": "FINISHED",
      "input": [{"query": "DeepSeek 最新模型 2025"}],
      "output": [{"url": "...", "title": "...", "snippet": "...", "cite_index": 1}]
    },
    {
      "type": "text",
      "content": "根据搜索结果，DeepSeek 最新的模型是 **DeepSeek-V4**...",
      "references": []
    }
  ],
  "accumulated_token_usage": 10329,
  "conversation_mode": "SEARCH",
  ...
}
```

### 2.5 Resume 场景案例

用户在 block_2 文本生成中途刷新页面：

```
event: ready
data: {"response_message_id":2,"user_message_id":1,"session_id":"session_x7k9"}

event: upsert_message
data: {"message_id":2,"status":"WIP","blocks":[{"type":"text","content":"我来搜索一下 DeepSeek 最新的模型信息。","references":[]},{"type":"tool_call","tool_name":"web_search","tool_call_id":"call_00_OSj24csm7SsQjdyR8GJZ8930","status":"FINISHED","input":[{...}],"output":[{...}]},{"type":"text","content":"根据搜索结果，DeepSeek 最新的模型是 **DeepSeek-V4**","references":[]}],...}

data: {"o":"append","p":"blocks/2/content","v":"，于 2026年4月24日 发布预览版。"}

data: {"v":"\n\n## 核心亮点\n1. 超长上下文：1M Token"}

...后续增量继续...

event: done
data: {"status":"finished"}
```

### 2.6 Resume 失败场景案例

run 已失败或过期时，客户端尝试 resume：

```
event: ready
data: {"response_message_id":2,"user_message_id":1,"session_id":"session_x7k9"}

event: upsert_message
data: {"message_id":2,"status":"FAILED","incomplete_message":"生成超时","blocks":[{"type":"text","content":"我来搜索一下 DeepSeek 最新的模型信息。","references":[]},{"type":"tool_call","tool_name":"web_search","tool_call_id":"call_00_OSj24csm7SsQjdyR8GJZ8930","status":"FINISHED","input":[{...}],"output":[{...}]},{"type":"text","content":"根据搜索结果，DeepSeek 最新的","references":[]}],...}

event: error
data: {"message":"run expired: no heartbeat for 30s","code":"run_expired"}
```

客户端收到 `upsert_message` 后 message 状态已收敛为 `FAILED`，不会永久卡在 WIP。

---

## 3. 与 v2 协议的差异对照

| 维度           | v2                                           | v3                                          |
| -------------- | -------------------------------------------- | ------------------------------------------- |
| 寻址           | `target: {type, id, parent?}` 结构化实体寻址 | `p: "blocks/0/content"` path-based 寻址     |
| 实体 ID        | block 有 id（数字递增）                      | block 无 id，用数组 index                   |
| message 初始化 | `op: "upsert"` 默认事件                      | `event: upsert_message` named event         |
| session 更新   | `target: {type:"session"}` 默认事件          | `event: update_session` named event         |
| 操作类型       | `upsert / set / append / delete`             | `add / append / set / batch`                |
| add vs append  | 不区分，统一用 `append` 到数组或字符串       | `add` = 数组新增元素，`append` = 字符串追加 |
| 帧结构         | `{target?, op?, path?, value}`               | `{o?, p?, v}`                               |
| 字段命名       | 全称 `target/op/path/value`                  | 缩写 `o/p/v`（热路径带宽优化）              |
| 压缩粒度       | target + op + path 三字段独立继承            | o + p 两字段联合继承                        |
| 非热路径帧体积 | ~105 bytes                                   | ~50 bytes                                   |
| 热路径帧体积   | `{"value":"..."}` ~15 bytes                  | `{"v":"..."}` ~12 bytes                     |

---

## 4. 重构计划

### 4.1 涉及文件清单

#### chat-core 共享层

| 文件                     | 变更类型 | 说明                                                                  |
| ------------------------ | -------- | --------------------------------------------------------------------- |
| `lib/chat-core/types.ts` | **重写** | 删除 Target/MutationEnvelope/CoreBlock.id，新增 PatchOp/PatchEnvelope |
| `lib/chat-core/index.ts` | 修改     | 更新导出                                                              |

#### chat-core 服务端

| 文件                                       | 变更类型                      | 说明                                                                               |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| `lib/chat-core/server/mutation-emitter.ts` | **重写** → `patch-emitter.ts` | 新 emitter：发送 named events + 默认 patch 事件，管理 o/p sticky                   |
| `lib/chat-core/server/stream-bridge.ts`    | **重写**                      | 使用新 emitter，block 用 index 而非 id，发送 `upsert_message` 而非 mutation upsert |
| `lib/chat-core/server/sse.ts`              | 保留                          | 底层 SSE 帧发送不变                                                                |

#### chat-core 客户端

| 文件                                    | 变更类型 | 说明                                                                                 |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `lib/chat-core/client/patch-apply.ts`   | 修改     | 删除旧 op 兼容，只支持 `add/append/set`                                              |
| `lib/chat-core/client/stream-parser.ts` | **重写** | named event handler（ready/upsert_message/session/done/error）+ 默认事件 apply patch |

#### 业务层（session-chat 前端）

| 文件                                     | 变更类型 | 说明                                           |
| ---------------------------------------- | -------- | ---------------------------------------------- |
| `features/session-chat/types.ts`         | **重写** | 删除 block id，ChatMessageBlock 不再有 id 字段 |
| `features/session-chat/stream/parser.ts` | **重写** | 消费新 named events + patch 事件               |
| `features/session-chat/stream/stream.ts` | 修改     | patchContext 简化为 `{lastOp, lastPath}`       |

#### 业务层（session-chat 后端）

| 文件                                         | 变更类型 | 说明                                                         |
| -------------------------------------------- | -------- | ------------------------------------------------------------ |
| `src/server/session-chat/chat-completion.ts` | **大改** | 使用新 emitter，发送 upsert_message，block 无 id，index 寻址 |

#### 存储层

| 文件                   | 变更类型 | 说明                                     |
| ---------------------- | -------- | ---------------------------------------- |
| `prisma/schema.prisma` | 修改     | Message.blocks JSON 中删除 block id 字段 |
| 新增 migration         | 新增     | 清理已有数据中的 block id                |

### 4.2 新 types.ts 设计

```ts
// ===== Protocol Layer =====

export type PatchOp = "add" | "append" | "set" | "batch";

export interface PatchEnvelope {
  o?: PatchOp;
  p?: string;
  v: unknown;
}

/** A single item inside a batch — inherits parent o/p if omitted */
export interface BatchItem {
  o?: Exclude<PatchOp, "batch">;
  p?: string;
  v: unknown;
}

export interface PatchContext {
  lastOp: PatchOp | null;
  lastPath: string | null;
}

// Named event payloads
export interface ReadyPayload {
  response_message_id: number;
  user_message_id: number;
  session_id: string;
}

export interface SessionPayload {
  title?: string;
  updated_at?: number;
}

export interface DonePayload {
  status: RunStatus;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

// ===== Domain Layer =====

export type MessageStatus = "WIP" | "FINISHED" | "FAILED";
export type BlockStatus = "WIP" | "FINISHED" | "FAILED";
export type RunStatus = "finished" | "failed" | "cancelled";

export type BlockType = "text" | "tool_call" | "reasoning" | "error" | string;

export interface TextBlock {
  type: "text";
  content: string;
  references?: Array<Record<string, unknown>>;
}

export interface ToolCallBlock {
  type: "tool_call";
  tool_name: string;
  tool_call_id: string;
  status: BlockStatus;
  input: unknown[];
  output: unknown[];
}

export interface ReasoningBlock {
  type: "reasoning";
  content: string;
}

export type Block =
  | TextBlock
  | ToolCallBlock
  | ReasoningBlock
  | Record<string, unknown>;

// ===== Search =====
export interface SearchQueryPayload {
  query: string;
}
export interface SearchResultPayload {
  url: string;
  title: string;
  snippet: string;
  cite_index: number;
  site_name?: string;
}
export type WebSearchFn = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<SearchResultPayload[]>;

export interface WebSearchBlock extends ToolCallBlock {
  tool_name: "web_search";
  input: SearchQueryPayload[];
  output: SearchResultPayload[];
}
```

### 4.3 新 patch-emitter.ts 核心设计

```ts
import { sendSseFrame } from "./sse";
import type { PatchOp } from "../types";

export interface PatchEmitter {
  sendReady(data: {
    response_message_id: number;
    user_message_id: number;
    session_id: string;
  }): void;
  sendUpsertMessage(message: Record<string, unknown>): void;
  sendSession(data: { title?: string; updated_at?: number }): void;
  sendDone(data: { status: string }): void;
  sendError(data: { message: string; code?: string }): void;
  sendPatch(o: PatchOp, p: string, v: unknown): void;
  sendBatch(p: string, items: BatchItem[]): void;
}

export function createPatchEmitter(
  controller: ReadableStreamDefaultController,
): PatchEmitter {
  const encoder = new TextEncoder();
  let lastOp: PatchOp | null = null;
  let lastPath: string | null = null;

  const send = (frame: { event?: string; data: unknown }) => {
    sendSseFrame(controller, encoder, frame);
  };

  return {
    sendReady(data) {
      send({ event: "ready", data });
    },
    sendUpsertMessage(message) {
      send({ event: "upsert_message", data: message });
    },
    sendSession(data) {
      send({ event: "update_session", data });
    },
    sendDone(data) {
      send({ event: "done", data });
    },
    sendError(data) {
      send({ event: "error", data });
    },

    sendPatch(o, p, v) {
      const payload: Record<string, unknown> = { v };
      if (o !== lastOp || p !== lastPath) {
        payload.o = o;
        payload.p = p;
      }
      lastOp = o;
      lastPath = p;
      send({ data: payload });
    },
  };
}
```

### 4.4 执行步骤

#### Phase 1：协议层（chat-core 共享 + 服务端）

1. 重写 `lib/chat-core/types.ts`
2. 新建 `lib/chat-core/server/patch-emitter.ts`
3. 重写 `lib/chat-core/server/stream-bridge.ts`（block 用 index，无 id）
4. 删除旧 `mutation-emitter.ts`
5. 更新 `lib/chat-core/index.ts`

**验证**：mock stream 测试，验证输出符合 v3 格式。

#### Phase 2：客户端解析层

1. 修改 `lib/chat-core/client/patch-apply.ts`（只支持新 op）
2. 重写 `lib/chat-core/client/stream-parser.ts`（named event + default patch）

**验证**：用 Phase 1 的 mock 输出验证客户端状态还原正确。

#### Phase 3：业务层适配

1. 重写 `features/session-chat/types.ts`（删除 block id）
2. 重写 `features/session-chat/stream/parser.ts`
3. 修改 `features/session-chat/stream/stream.ts`
4. 大改 `src/server/session-chat/chat-completion.ts`

**验证**：端到端测试完整 chat completion 流。

#### Phase 4：存储层清理

1. Migration 清理 blocks JSON 中的 id 字段
2. 更新 history-messages.ts 返回格式

**验证**：刷新页面 resume、历史消息加载正常。

---

## 5. 协议规则速查

| 规则                          | 描述                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| **R1: 一条流一条消息**        | ready 建立唯一 message 上下文，后续帧隐式属于该 message                                      |
| **R2: named events**          | `ready` / `upsert_message` / `update_session` / `done` / `error` / `keepalive`               |
| **R3: patch ops**             | `add`（数组新增）/ `append`（字符串追加）/ `set`（赋值）/ `batch`（批量原子操作）            |
| **R3b: batch 规则**           | `batch` 不可嵌套；子 item 省略 `o`/`p` 时继承父帧 sticky 上下文；`v` 必须为 `BatchItem[]`   |
| **R4: sticky 继承**           | 只继承上一条默认事件的 o/p，named event 不参与继承链                                         |
| **R5: upsert_message 语义**   | 无条件覆盖本地 message 状态，首次和 resume 统一处理                                          |
| **R6: block 无 id**           | 用数组 index 寻址，`add` 到 blocks 后新 block index = 当前长度 - 1                           |
| **R7: add 时 value 必须完整** | `add` 到数组的 value 必须是完整的 block 对象                                                 |
| **R8: resume 必须收敛状态**   | 失败/过期 resume 必须发送 `upsert_message(FAILED)` 再发 `error`，确保无永久 WIP              |
| **R9: 状态枚举分层**          | message/block 用大写 `WIP/FINISHED/FAILED`，run lifecycle 用小写 `finished/failed/cancelled` |
