# SSE Protocol v2：基于 named events + default mutation 的 Agent 流式协议

> 本文档定义 chat-core 下一代 SSE 协议设计、完整的真实数据 SSE 消息案例，以及从当前 `t/p/o/v` 协议迁移到 v2 的重构计划。
>
> **不向后兼容**。当前 `block`、隐式 target、旧 context-sticky 等设计将被完全替换。

---

## 1. 协议设计

### 1.1 设计原则

| 原则                                      | 说明                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **协议稳定、业务可扩**                    | envelope 字段（`target/op/path/value`）不随业务变化；新能力通过 `block.type` 扩展                      |
| **upsert = 完整快照，patch = 增量 delta** | `op: "upsert"` 和 `op: "append"` 到数组时，`value` 必须包含实体全部字段；后续 `set/append` 只携带变更 |
| **自描述 + 可压缩**                       | 每条 mutation 可独立解读（完整 envelope）；连续相同 target/op/path 时允许省略以节省带宽               |
| **刷新可接入**                            | 业务层通过 `chat_session_id + message_id` 接入正在生成的响应，协议层保持无序号 mutation                |

### 1.2 SSE Event Types

SSE 事件分为两类：

| 类别             | SSE event 字段                                  | 说明                               |
| ---------------- | ----------------------------------------------- | ---------------------------------- |
| **生命周期信号** | `event: ready` / `event: done` / `event: error` | 每种信号独立命名，payload 形状各异 |
| **状态变更**     | 无 `event:` 字段（SSE 默认事件）                | 统一的 `target/op/path/value` 结构 |

设计原则：

- **payload 形状不同、语义不同 → 拆成不同 named event**（生命周期信号）
- **payload 形状相同、处理路径相同 → 保持统一事件**（状态变更）

状态变更使用默认事件（不带 `event:` 前缀），因为它占 SSE 流的 99%，每帧省去 `event: mutation\n` 节约带宽。

### 1.3 生命周期事件

每种生命周期信号使用独立的 SSE event name：

| SSE event          | payload                                    | 说明                              |
| ------------------ | ------------------------------------------ | --------------------------------- |
| `event: ready`     | `{ response_message_id, user_message_id }` | run 开始，建立 run ↔ message 绑定 |
| `event: done`      | `{ status }`                               | run 结束                          |
| `event: error`     | `{ message }`                              | run 异常终止                      |
| `event: keepalive` | `{}`                                       | 心跳保活                          |

#### `ready` 事件设计说明

`ready` 携带 `response_message_id` 和 `user_message_id`：

- `response_message_id`：建立 run ↔ message 绑定。客户端在 ready 时刻就完成“这个 run 正在生成 msg_N”的关联，后续所有 mutation 都有了归属
- `user_message_id`：客户端用于将乐观更新的用户消息（负 ID）替换为服务端真实 ID，保证消息排序正确

message 的创建统一由后续 `op: "upsert"` mutation 驱动，`ready` 不触发消息创建。

#### 为什么 session 更新不做独立事件？

一种直觉方案是为 session 定义独立的 SSE event type（如 `event: session`），这样可以省掉 `target` 字段。v1 协议正是这么做的（`update_session`、`title` 等各一个 event type）。v2 选择让 session 更新沿用统一的 `mutation` 事件，原因如下：

1. **协议表面积不膨胀**：每新增一种实体就加一种 event type，协议会不断膨胀。统一的 `mutation` + `target` 让新增实体类型只需扩展 `target.type`，协议层无需变更。
2. **压缩规则统一**：连续的 session mutation（如 `updated_at` → `title`）可以复用同一套压缩机制省略 `target`。
3. **客户端一个 reducer**：统一 `mutation` 让客户端只需一个 reducer 按 `target.type` 分发。多种 event type 会带来多个 handler 和更多分支。

session 更新在整个流中通常只占 2–3 条（本例 25 条中 3 条），为它省掉 `target` 字段而引入一种新 event type，投入产出比很低。

### 1.4 Mutation 事件

#### Envelope 字段

```ts
interface MutationEnvelope {
  // 以下三个字段支持 context-sticky 压缩（见 1.6）
  target?: Target; // 操作目标
  op?: MutationOp; // 操作类型
  path?: string; // 目标内属性路径

  value: unknown; // 载荷
}
```

#### Target 类型

```ts
type Target = {
  type: "session" | "message" | "block" | "artifact";
  id: string;
  parent?: {
    type: "message" | "block";
    id: string;
  };
  // 高级场景：sub-agent、parallel step、workflow
  scope?: Array<{ type: string; id: string }>;
};
```

- 普通 chat 只用 `target` + 可选的一层 `parent`
- `scope` 保留给 sub-agent / workflow 等多层嵌套场景

#### Operation 类型

```ts
type MutationOp = "upsert" | "set" | "append" | "delete";
```

| op       | 语义               | path 示例                                     | value 要求                     |
| -------- | ------------------ | --------------------------------------------- | ------------------------------ |
| `upsert` | 创建或整体替换实体 | `""`                                          | 实体完整快照                   |
| `set`    | 设置属性值         | `"status"` / `"output/results"`               | 属性新值                       |
| `append` | 追加到字符串或数组 | `"content"` / `"blocks"` / `"output/results"` | 追加内容；数组元素须为完整对象 |
| `delete` | 删除实体或属性     | `""` / `"blocks/2"`                           | 通常为 `null`                  |

#### Path 语法

`path` 使用 `/` 分隔嵌套属性，本质上是简化版 JSON Pointer（省掉开头的 `/`）：

| path                         | 语义           | 场景                                    |
| ---------------------------- | -------------- | --------------------------------------- |
| `""`                         | 实体自身       | upsert / delete 整个实体                |
| `"status"`                   | 顶层属性       | `set` 状态                              |
| `"content"`                  | 顶层属性       | `append` 文本                           |
| `"output"`                   | 顶层属性       | `set` 搜索结果数组                      |
| `"blocks/2"`                 | 数组索引       | `delete` blocks 中第 3 个元素           |
| `"output/0"`                 | 数组元素       | `set` 整体替换第 1 条 result            |
| `"output/0/snippet"`         | 数组元素内属性 | `set` 修改第 1 条 result 的 snippet     |

客户端解析 path 时按 `/` 拆分为 segments，数字 segment 视为数组索引，逐层定位到目标属性后执行 op 操作。

数组定位使用数字索引而非 key 查找，因为 SSE 是服务端单向有序推送，索引是确定性的，无需引入过滤语法增加协议复杂度。

### 1.5 业务对象（Domain Objects）

协议层不定义业务对象 schema，但约定以下稳定实体类型：

| 实体     | target.type  | 承载内容                           |
| -------- | ------------ | ---------------------------------- |
| Session  | `"session"`  | 会话元数据（title、updated_at 等） |
| Message  | `"message"`  | 一条完整的 user/assistant 消息     |
| Block    | `"block"`    | 消息内的结构化内容单元             |
| Artifact | `"artifact"` | 生成的独立产物（代码、文件等）     |

#### Block 子类型（通过 `block.type` 扩展）

| block.type         | 说明     | 典型字段                                                 |
| ------------------ | -------- | -------------------------------------------------------- |
| `text`             | 文本回复 | `content`, `references`                                  |
| `tool_call`        | 工具调用 | `tool_name`, `tool_call_id`, `input`, `output`, `status` |
| `reasoning`        | 思考过程 | `content`                                                |
| `artifact`         | 内联产物 | `artifact_id`, `language`, `content`                     |
| `error`            | 错误信息 | `message`, `code`                                        |
| `approval_request` | 人工确认 | `prompt`, `options`                                      |

新增业务类型只需定义新的 `block.type`，协议层无需变更。

### 1.6 Context-Sticky 压缩规则

> 当连续默认事件（mutation）的 `target`、`op`、`path` 均与上一条相同时，可省略这三个字段。

**重要约束：**

- 继承源只能是上一条默认事件（mutation），named event（ready/done/error）不参与继承链，也不重置继承状态
- 服务端快照接入时，第一条状态 mutation 使用完整 envelope
- 客户端实现必须同时支持完整和省略两种格式

### 1.7 刷新后重新接入

页面重新加载后，前端先通过 REST API 拉取会话历史：

```http
GET /api/sessions/{session_id}/messages
```

返回数据中出现 `status: "wip"` 的 assistant message，表示这条响应生成处于活跃、完成前刷新、失败前刷新等待判定状态。客户端使用会话 ID 和这条 assistant message 的 ID 打开接入流：

```http
POST /api/v0/chat/resume_stream
Content-Type: application/json

{
  "chat_session_id": "ef80fe64-4e97-48b3-bfcf-9eb05b38ca06",
  "message_id": 2
}
```

服务端按 run 当前状态处理：

| run 状态 | 服务端行为 |
| -------- | ---------- |
| 还在跑 | 先发送 `ready`，再发送当前 assistant message 的完整 `upsert` 快照，然后继续推送后续增量 |
| 已完成 | 发送最终状态或直接发送 `event: done`，客户端以 REST 历史作为最终数据 |
| 已失败/过期 | 发送 `event: error`，客户端展示生成已中断 |

重新接入流使用“快照 + 增量续传”：

```json
event: ready
data: {"response_message_id":"msg_2","user_message_id":"msg_1"}

data: {"target":{"type":"message","id":"msg_2"},"op":"upsert","path":"","value":{"id":"msg_2","status":"wip","blocks":[...]}}

data: {"target":{"type":"block","id":"block_3","parent":{"type":"message","id":"msg_2"}},"op":"append","path":"content","value":"接下来的文本..."}

event: done
data: {"status":"finished"}
```

快照接入由业务层 `RunManager` 承担：按 `chat_session_id + message_id` 查找活跃生成任务、维护最新 message 快照、允许新的 SSE 连接挂到正在运行的 producer 上。chat-core 只定义 `target/op/path/value` mutation 协议。

---

## 2. 完整 SSE 消息案例

以下基于真实数据，模拟一次包含搜索工具调用的完整 agent 响应流。

### 2.1 场景

用户在搜索模式下提问"DeepSeek 最新模型"，assistant 先输出一段引导文本，调用 `web_search` 工具，再基于搜索结果生成最终回复。

### 2.2 完整 SSE 流

```json
event: ready
data: {"response_message_id":"msg_2","user_message_id":"msg_1"}

data: {"target":{"type":"session","id":"session_x7k9"},"op":"set","path":"updated_at","value":1778548419.388}

data: {"target":{"type":"message","id":"msg_2"},"op":"upsert","path":"","value":{"id":"msg_2","parent_id":"msg_1","model":"","role":"assistant","thinking_enabled":false,"ban_edit":false,"ban_regenerate":false,"status":"wip","incomplete_message":null,"accumulated_token_usage":0,"feedback":null,"inserted_at":1778548419.387,"search_enabled":true,"blocks":[],"conversation_mode":"search","has_pending_block":false,"auto_continue":false}}

data: {"target":{"type":"message","id":"msg_2"},"op":"append","path":"blocks","value":{"id":"block_1","type":"text","content":"","references":[],"status":"wip","stage_id":null}}

data: {"target":{"type":"block","id":"block_1","parent":{"type":"message","id":"msg_2"}},"op":"append","path":"content","value":"我来"}

data: {"value":"搜索"}

data: {"value":"一下"}

data: {"value":" DeepSeek"}

data: {"value":" 最新的"}

data: {"value":"模型"}

data: {"value":"信息。"}

data: {"target":{"type":"message","id":"msg_2"},"op":"append","path":"blocks","value":{"id":"block_2","type":"tool_call","tool_name":"web_search","tool_call_id":"call_00_OSj24csm7SsQjdyR8GJZ8930","status":"wip","content":null,"input":[{"query":"DeepSeek 最新模型 2025"}],"output":[],"references":[],"stage_id":null}}

data: {"target":{"type":"block","id":"block_2","parent":{"type":"message","id":"msg_2"}},"op":"set","path":"output","value":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？ - 华尔街见闻","snippet":"...","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]}]}

data: {"op":"set","path":"status","value":"finished"}

data: {"target":{"type":"message","id":"msg_2"},"op":"append","path":"blocks","value":{"id":"block_3","type":"text","content":"","references":[],"status":"wip","stage_id":null}}

data: {"target":{"type":"block","id":"block_3","parent":{"type":"message","id":"msg_2"}},"op":"append","path":"content","value":"根据搜索结果，DeepSeek 最新的模型是 **DeepSeek-V4**，于 **2026年4月24日** 发布预览版 "}

data: {"value":"<citation cite_index=\"6\">6</citation><citation cite_index=\"10\">10</citation>。以下是详细信息：\n\n## 🚀 DeepSeek-V4 介绍\n\n### 版本细分\nDeepSeek-V4 预览版包含两个子版本：\n- **DeepSeek-V4-Pro**：性能比肩顶级闭源模型的旗舰版本\n- **DeepSeek-V4-Flash**：更快捷高效的经济之选"}

data: {"value":"\n\n### 核心亮点\n1. **超长上下文**：最大上下文长度扩展至 **1M（100万Token）** <citation cite_index=\"1\">1</citation><citation cite_index=\"6\">6</citation>\n2. **双模式支持**：同时支持**非思考模式**与**思考模式** <citation cite_index=\"6\">6</citation>\n3. **Agent 能力大幅增强** <citation cite_index=\"6\">6</citation>\n4. **多模态能力** <citation cite_index=\"5\">5</citation>"}

data: {"value":"\n\n### 此前的主要模型版本\n- **DeepSeek-V3.2**（2025年12月）<citation cite_index=\"6\">6</citation>\n- **DeepSeek-R1-0528**（2025年5月）<citation cite_index=\"6\">6</citation>\n- **DeepSeek-V3-0324**（2025年3月）<citation cite_index=\"6\">6</citation>\n- **DeepSeek-R1**（2025年1月）<citation cite_index=\"2\">2</citation>\n- **DeepSeek-V3**（2024年12月）<citation cite_index=\"6\">6</citation>\n\n目前 DeepSeek-V4 已在官网、APP 和 API 平台上线，你可以免费体验使用！🎉"}

data: {"target":{"type":"block","id":"block_3","parent":{"type":"message","id":"msg_2"}},"op":"set","path":"status","value":"finished"}

data: {"target":{"type":"message","id":"msg_2"},"op":"set","path":"accumulated_token_usage","value":10329}

data: {"op":"set","path":"status","value":"finished"}

data: {"target":{"type":"session","id":"session_x7k9"},"op":"set","path":"updated_at","value":1778548425.123}

data: {"op":"set","path":"title","value":"DeepSeek 最新模型"}

event: done
data: {"status":"finished"}
```

### 2.3 压缩效果说明

| 片段 | 是否省略 target/op/path | 继承自 |
| ---- | ----------------------- | ------ |
| `block_1` 第一段文本 | 完整发送 | 上一条 target 变化 |
| `block_1` 后续文本 | 省略 target/op/path | `block_1` 第一段文本 |
| `block_2` output 完成 | 完整发送 | target 变化 |
| `block_2` status 完成 | 省略 target，发送 op/path | `block_2` output 完成 |
| `block_3` 第一段文本 | 完整发送 | target 变化 |
| `block_3` 后续文本 | 省略 target/op/path | `block_3` 第一段文本 |
| message status 完成 | 省略 target，发送 op/path | message token usage 更新 |
| session title 更新 | 省略 target，发送 op/path | session updated_at 更新 |

### 2.4 最终状态快照

客户端按序应用所有 mutation 后，应得到与 REST API 返回一致的完整对象：

```json
{
  "id": "msg_2",
  "parent_id": "msg_1",
  "model": "",
  "role": "assistant",
  "thinking_enabled": false,
  "ban_edit": false,
  "ban_regenerate": false,
  "status": "finished",
  "incomplete_message": null,
  "accumulated_token_usage": 10329,
  "feedback": null,
  "inserted_at": 1778548419.387,
  "search_enabled": true,
  "blocks": [
    {
      "id": "block_1",
      "type": "text",
      "content": "我来搜索一下 DeepSeek 最新的模型信息。",
      "references": [],
      "status": "wip",
      "stage_id": null
    },
    {
      "id": "block_2",
      "type": "tool_call",
      "tool_name": "web_search",
      "tool_call_id": "call_00_OSj24csm7SsQjdyR8GJZ8930",
      "status": "finished",
      "content": null,
      "input": { "query": "DeepSeek 最新模型 2025" },
      "output": { "queries": ["..."], "results": ["..."] },
      "references": [],
      "stage_id": null,
      "queries": [],
      "results": []
    },
    {
      "id": "block_3",
      "type": "text",
      "content": "根据搜索结果，DeepSeek 最新的模型是 **DeepSeek-V4**...🎉",
      "references": [],
      "status": "finished",
      "stage_id": null
    }
  ],
  "conversation_mode": "search",
  "has_pending_block": false,
  "auto_continue": false
}
```

### 2.5 Sub-agent 场景案例（`scope` 字段）

以下演示主 agent 调度 `code_review` sub-agent 的场景。主 agent 写完代码后，发起 sub-agent 调用，sub-agent 产出自己的 reasoning 和 text block，通过 `scope` 标记嵌套归属。

```json
data: {"target":{"type":"block","id":"block_code","parent":{"type":"message","id":"msg_2"}},"op":"append","path":"content","value":"function add(a, b) { return a + b; }"}

data: {"target":{"type":"message","id":"msg_2"},"op":"append","path":"blocks","value":{"id":"block_review","type":"tool_call","tool_name":"code_review_agent","status":"wip","input":{"code":"function add(a, b) { return a + b; }"},"output":null}}

data: {"target":{"type":"block","id":"sub_block_reasoning","parent":{"type":"block","id":"block_review"},"scope":[{"type":"agent","id":"code_review_agent_1"}]},"op":"upsert","path":"","value":{"id":"sub_block_reasoning","type":"reasoning","content":"","status":"wip"}}

data: {"op":"append","path":"content","value":"检查参数类型...没有类型校验，"}

data: {"value":"也没有处理非数字输入的情况。"}

data: {"target":{"type":"block","id":"sub_block_result","parent":{"type":"block","id":"block_review"},"scope":[{"type":"agent","id":"code_review_agent_1"}]},"op":"upsert","path":"","value":{"id":"sub_block_result","type":"text","content":"","status":"wip"}}

data: {"op":"append","path":"content","value":"建议：添加参数类型检查，处理 NaN 边界情况。"}

data: {"target":{"type":"block","id":"block_review","parent":{"type":"message","id":"msg_2"}},"op":"set","path":"status","value":"finished"}
```

**`scope` 的作用：**

- 没有 `scope` 时，`parent` 只能表达"sub_block 属于 block_review"，但**无法区分**是哪个 agent 产出的
- 有 `scope` 后，客户端可按 agent 分组渲染（如折叠面板、并行泳道）
- 更深层嵌套（agent A → step B → agent C）时，`scope` 按调用链排列：

```json
"scope": [
  {"type": "agent", "id": "orchestrator_1"},
  {"type": "step", "id": "parallel_step_3"},
  {"type": "agent", "id": "code_review_agent_1"}
]
```

---

## 3. 与当前协议的差异对照

| 维度            | 当前 (v1)                                                                  | 新协议 (v2)                                                 |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| SSE event types | `ready` / `update_session` / `title` / `error` / `close` + 无名 `data:` 帧 | named events (`ready`/`done`/`error`) + 默认事件 (mutation) |
| 寻址            | `t: {type: "response"} \| {type: "block", id}` — 固定两层              | `target: {type, id, parent?}` — 通用实体寻址                |
| 操作            | `o: "APPEND" \| "SET" \| "BATCH"`                                          | `op: "upsert" \| "set" \| "append" \| "delete"`             |
| 压缩            | 隐式 context-sticky                                                        | 显式 context-sticky，按上一条默认事件继承上下文             |
| 初始化          | `data: {"v":{"response":{...}}}` 隐式 upsert                               | 显式 `op: "upsert"` + 完整快照                              |
| 刷新接入        | 客户端刷新后重新拉 REST 历史                                               | REST 历史发现 wip message 后接入活跃 run，先快照再增量     |
| 命名            | `block`                                                                    | `block`                                                     |
| 工具调用        | `block.type = "tool_call"` 独立实体                                        | `block.type = "tool_call"` 作为 block 子类型                |

---

## 4. 重构计划

### 4.1 落地策略

采用两阶段落地：第一阶段实现 v2 基础流式协议，验证现有 chat completion 功能完整迁移；第二阶段实现刷新后的快照接入。

第一阶段聚焦事件模型和状态模型：

- 生命周期信号使用独立 named event：`event: ready`、`event: done`、`event: error`
- 状态变更使用 SSE 默认事件（无 `event:` 前缀）
- `target/op/path/value` 作为核心 envelope
- 前端以 `message upsert` 创建 assistant 消息占位

第一阶段验收标准：

- 流式文本正常追加
- tool call 正常创建、更新、完成
- session `title` / `updated_at` 正常更新
- message / block 状态正常收敛
- stop / error / done 行为与现有功能一致

第二阶段聚焦刷新接入能力：

- REST 会话历史返回 wip assistant message，客户端保留 `chat_session_id` 和 `message_id`
- 新增 `POST /api/v0/chat/resume_stream`
- 服务端 `RunManager` 跟踪活跃 run 的当前状态和订阅者
- 接入活跃 run 时先发送 message 完整 `upsert` 快照，再继续推送增量
- 接入已完成 run 时发送 `done` 或最终状态
- 接入失败/过期 run 时发送 `error`

阶段边界：第一阶段验证功能等价；第二阶段验证刷新页面、关闭 tab 后重开、活跃 run 结束后的接入行为。

### 4.2 涉及文件清单

#### chat-core 共享层

| 文件                     | 变更类型 | 说明           |
| ------------------------ | -------- | -------------- |
| `lib/chat-core/types.ts` | **重写** | 新协议类型定义 |
| `lib/chat-core/index.ts` | 修改     | 更新导出       |

#### chat-core 服务端

| 文件                                    | 变更类型                         | 说明                                                             |
| --------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `lib/chat-core/server/sse.ts`           | 修改                             | 输出 named lifecycle events 和默认事件                           |
| `lib/chat-core/server/patch-emitter.ts` | **重写** → `mutation-emitter.ts` | 新 emitter：管理 context-sticky 压缩                             |
| `lib/chat-core/server/stream-bridge.ts` | **重写**                         | 使用新 emitter，发射 named lifecycle events + 默认 mutation 事件 |

#### chat-core 客户端

| 文件                                      | 变更类型 | 说明                                                |
| ----------------------------------------- | -------- | --------------------------------------------------- |
| `lib/chat-core/client/patch-apply.ts`     | 修改     | `op` 替代 `o`，新增 `upsert`/`delete` 支持          |
| `lib/chat-core/client/stream-parser.ts`   | **重写** | named event + default event handler，新 target 解析 |
| `lib/chat-core/client/stream-consumer.ts` | 修改     | 支持刷新后的 resume stream 接入                     |

#### chat-core UI

| 文件                                  | 变更类型                      | 说明                  |
| ------------------------------------- | ----------------------------- | --------------------- |
| `lib/chat-core/ui/block-renderer.tsx` | 重命名 → `block-renderer.tsx` | `block` → `block`     |
| `lib/chat-core/ui/search-block.tsx`   | 重命名 → `search-block.tsx`   | 同上                  |
| `lib/chat-core/ui/tool-block.tsx`     | 重命名 → `tool-block.tsx`     | 同上                  |
| `lib/chat-core/ui/chat-response.tsx`  | 修改                          | 引用 block 替代 block |

#### 业务层（session-chat 前端）

| 文件                                       | 变更类型 | 说明                                                                          |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------------- |
| `features/session-chat/types.ts`           | **重写** | `ChatBlock` → `ChatBlock`，`ChatMessage.blocks` → `blocks`，新增 `RunContext` |
| `features/session-chat/stream/parser.ts`   | **重写** | 消费新协议的 named lifecycle events + 默认 mutation 事件                      |
| `features/session-chat/stream/stream.ts`   | 修改     | `patchContext` → `mutationContext`，支持 resume stream 接入                   |
| `features/session-chat/stream/messages.ts` | 修改     | `block` → `block` 命名                                                        |

#### 业务层（session-chat 后端）

| 文件                                         | 变更类型 | 说明                                                                                              |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `src/server/session-chat/chat-completion.ts` | **大改** | 使用新 emitter，named events 替代旧的 `ready/update_session/title/close/error`，`block` → `block` |

### 4.3 新 types.ts 设计

```ts
// ===== Protocol Layer =====

export type MutationOp = "upsert" | "set" | "append" | "delete";

export type TargetType = "session" | "message" | "block" | "artifact";

export interface Target {
  type: TargetType;
  id: string;
  parent?: {
    type: "message" | "block";
    id: string;
  };
  scope?: Array<{ type: string; id: string }>;
}

export interface MutationEnvelope {
  target: Target;
  op: MutationOp;
  path: string;
  value: unknown;
}

export type LifecycleType = "ready" | "done" | "error" | "keepalive";

// 每种生命周期事件使用独立的 SSE event name，payload 省略 type 字段
// event: ready  → data: { response_message_id, user_message_id }
// event: done   → data: { status }
// event: error  → data: { message }

export interface MutationContext {
  lastTarget: Target | null;
  lastOp: MutationOp | null;
  lastPath: string | null;
}

// ===== Domain Layer =====

export type BlockType =
  | "text"
  | "tool_call"
  | "reasoning"
  | "artifact"
  | "error"
  | "approval_request"
  | string; // 开放扩展

export interface CoreBlock {
  id: string;
  type: BlockType;
  status?: string;
}

export interface TextBlock extends CoreBlock {
  type: "text";
  content: string;
  references?: Array<Record<string, unknown>>;
}

export interface ReasoningBlock extends CoreBlock {
  type: "reasoning";
  content: string;
}

export interface ToolCallBlock extends CoreBlock {
  type: "tool_call";
  tool_name?: string;
  tool_call_id?: string;
  input?: Record<string, unknown> | unknown;
  output?: unknown;
}

// ===== Search =====

export interface SearchQueryPayload {
  query: string;
}

export interface SearchResultPayload {
  url: string;
  title: string;
  snippet: string;
  cite_index: number;
  published_at?: number | null;
  site_icon?: string;
  site_name?: string;
  query_indexes?: number[];
}

export type WebSearchFn = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<SearchResultPayload[]>;

export interface MessageCitation {
  cite_index: number;
  url: string;
  title?: string;
  site_name?: string;
}
```

### 4.4 新 mutation-emitter.ts 核心设计

emitter 负责输出 named lifecycle events 和默认 mutation 事件，并管理 context-sticky 压缩。

```ts
import type {
  Target,
  MutationOp,
  LifecycleType,
} from "../types";

export interface MutationEmitter {
  /** 发送 lifecycle 事件 */
  sendLifecycle(type: LifecycleType, data?: Record<string, unknown>): void;

  /** 发送 mutation 事件（自动管理 context-sticky 压缩） */
  sendMutation(params: {
    target: Target;
    op: MutationOp;
    path: string;
    value: unknown;
  }): void;
}

export function createMutationEmitter(
  controller: ReadableStreamDefaultController,
): MutationEmitter {
  const encoder = new TextEncoder();
  let lastTarget: Target | null = null;
  let lastOp: MutationOp | null = null;
  let lastPath: string | null = null;

  const isSameTarget = (a: Target, b: Target | null): boolean => {
    if (!b) return false;
    return a.type === b.type && a.id === b.id;
    // parent 比较可选，简化为 type+id 级别
  };

  return {
    sendLifecycle(type, data = {}) {
      const payload = {
        ...data,
      };

      const lines: string[] = [];
      lines.push(`event: ${type}`);
      lines.push(`data: ${JSON.stringify(payload)}`);
      lines.push("");
      controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));

      // lifecycle 不重置 sticky context
    },

    sendMutation({ target, op, path, value }) {
      const canOmit =
        isSameTarget(target, lastTarget) && op === lastOp && path === lastPath;

      const payload: Record<string, unknown> = {};

      if (!canOmit) {
        payload.target = target;
        payload.op = op;
        payload.path = path;
      }

      payload.value = value;

      lastTarget = target;
      lastOp = op;
      lastPath = path;

      const lines = [`data: ${JSON.stringify(payload)}`, ""];
      controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
    },
  };
}
```

### 4.5 执行步骤

分 5 个阶段执行，每个阶段可独立验证。

#### Phase 1：基础协议层（chat-core 共享 + 服务端）

1. 重写 `lib/chat-core/types.ts` → 新协议类型
2. 新建 `lib/chat-core/server/mutation-emitter.ts` 替代 `patch-emitter.ts`
3. 重写 `lib/chat-core/server/stream-bridge.ts` → 使用 `MutationEmitter`
4. emitter 输出 named lifecycle events + 默认 mutation 事件
5. 删除旧 `patch-emitter.ts`
6. 更新 `lib/chat-core/index.ts` 导出

**验证**：写一个独立的 mock stream 测试，验证生成的 SSE 输出符合 Phase 1 v2 格式。

#### Phase 2：客户端解析层（chat-core 客户端）

1. 重写 `lib/chat-core/client/stream-parser.ts` → named event + default event handler
2. 修改 `lib/chat-core/client/patch-apply.ts` → 新 op 类型
3. reducer 只按 `target/op/path/value` 应用状态变更

**验证**：用 Phase 1 的 mock SSE 输出作为输入，验证客户端状态还原正确。

#### Phase 3：业务层适配

1. 重写 `features/session-chat/types.ts` — `block` → `block`
2. 重写 `features/session-chat/stream/parser.ts` — 新 event 处理
3. 修改 `features/session-chat/stream/stream.ts` — 新 context
4. 大改 `src/server/session-chat/chat-completion.ts` — 使用 MutationEmitter

**验证**：端到端测试完整的 chat completion 流。

#### Phase 4：UI 层重命名 + 清理

1. `block-renderer.tsx` → `block-renderer.tsx`
2. `search-block.tsx` → `search-block.tsx`
3. `tool-block.tsx` → `tool-block.tsx`
4. 更新 `chat-response.tsx` 中的引用
5. 全局搜索 `block` 确保无遗漏引用
6. 更新 `ARCHITECTURE.md`

**验证**：UI 渲染正常，所有 block 类型正确展示。

#### Phase 5：快照接入能力

1. REST 会话历史返回 wip assistant message，客户端记录 `chat_session_id` 和 `message_id`
2. 新增 `POST /api/v0/chat/resume_stream`
3. 业务层新增 `RunManager`，按 `chat_session_id + message_id` 跟踪活跃生成任务的 message 快照和 SSE 订阅者
4. 接入活跃 run 时先发送 `ready`，再发送 message 完整 `upsert` 快照
5. 快照后继续推送同一 producer 产生的增量 mutation
6. 接入已完成 run 时发送最终状态或 `done`
7. 接入失败/过期 run 时发送 `error`

**验证**：模拟刷新页面、关闭 tab 后重开、run 已完成、run 失败/过期，验证快照接入和错误展示。

---

## 5. 协议规则速查

| 规则                            | 描述                                                            |
| ------------------------------- | --------------------------------------------------------------- |
| **R1: Full Object on Creation** | `op: "upsert"` 或 `op: "append"` 到数组时，value 必须是完整对象 |
| **R2: SSE event 类型**          | named events (`ready`/`done`/`error`) + 默认事件 (mutation)     |
| **R3: mutation op**             | `upsert` / `set` / `append` / `delete`                          |
| **R4: 压缩继承**                | 只继承上一条默认事件，named event 不参与继承链                  |
| **R5: 快照接入**                | 接入活跃 run 时先发送完整 message `upsert`，再继续发送增量      |
| **R6: tool_call 定位**          | 统一作为 `block.type = "tool_call"`，属于 block 子类型          |
| **R7: parent.type**             | 允许 `"message" \| "block"`，支持未来嵌套                       |
