# 🚀 Advanced Stream Chat Architecture (DeepSeek R1 / Claude 范式)

这份设计文档与代码库提供了一套高度定制、极客级别的流式对话系统架构。本系统**完全剥离**了 Vercel AI SDK 以及过时的长轮询策略的包袱，专门为了拥抱最前沿的大模型（如 DeepSeek R1 级别的深度思考反馈、Claude 的多分支并行与结构化工具调用）以及极端顺畅的客户端体验（Optimistic UI）而生。

---

## 🧭 架构四大基石

### 基石一：Normalized Map（扁平化哈希对话树结构）

**参考来源**：顶级独立开发者的商用抓包数据分析与 Redux 最佳实践。
我们抛弃了容易陷入嵌套地狱的深层数组方案 (`children: Message[]`)，也摒弃了无法追踪上下文分支的单纯扁平化数组，直接采用映射表。

```typescript
export interface ChatTree {
  rootId: string;
  currentLeafId: string;
  mapping: Record<string, ChatNode>;
}

export interface ChatNode {
  id: string;
  parentId: string | null;
  childIds: string[]; // 用于渲染同级多分支：< 1 / 3 >
  role: "root" | "user" | "assistant";
  message: ChatMessage | null;
}
```

- **绝对优势**：前端从树的任何一个叶子节点（`currentLeafId`），通过不断的 `node.parentId` 向上回溯，能以 $O(树的深度)$（近乎 0ms）的极细微开销重建整条当前视图。无论用户点击多少次“重新生成”，产生多错综复杂的分叉，我们只需将其挂在对应的 `parentId` 之下并推入 `childIds`。切回旧分支只发生了一件事：修改 `currentLeafId` 的指针，页面瞬间无感重绘。

### 基石二：Optimistic UI (极速响应的乐观呈现)

我们在客户端本地生成用户的 `uuid` 和提前预留给 AI 气泡的 `uuid`。
当用户猛击“发送”或“回车”的瞬间，用户与机器人的空节点（`parts: []`）已经被立刻注入到了 `ChatTree` 的 `mapping` 之中，并将 `currentLeafId` 锁定到这个预先埋好的机器人的 ID 上。

- **绝对优势**：界面上字打出来的瞬间视图就已经刷新。不再需要漫长的“等待网络握手 -> 获得 ID -> 组件挂载”。如果中途网络断开或拉流失败，只需要在 `catch` 块中优雅地把刚才埋好的机器人节点标志 `status = 'error'` 兜底即可。

### 基石三：细粒度、强类型的事件与 Delta 流驱动 (SSE Protocol)

**参考来源**：Claude 官方 SSE API。
彻底取代混乱的全局纯文本追加或容易引发性能灾难的不可靠的 `JSON Patch` 算法。全新的架构将消息内部**精准细致地切分为多个 Content Block**，独立追踪各区块的流式生命周期。

通过定义 `message_start`, `content_block_start`, `content_block_delta` (支持 `text_delta`, `input_json_delta` 等多种形态), `content_block_stop`, `message_delta` 和 `message_stop` 等全新生命周期，单条 AI 消息可以同时或混合包含：

1. `reasoning` (思考探测过程)
2. `tool_use` (工具/函数调用请求，参数为流式生成)
3. `tool_result` (工具返回的全量结构化结果，支持前置预载结构)
4. `text` (普通富文本回答)

- **绝对优势**：遇到多模态或极复杂的工具交错调用时，由于自带 `index`，前端能够精准命中 `parts[data.index]` 予以渲染和差量拼接。未来加入 `audio` 频段或其他模态，只需增加一个新块类型，架构稳如磐石。此外，流中还支持抛出带外事件（如 `message_limit`, `error`），可向客户端无缝传递 Token 统计、限流风控等全量 Context 外带信息。

### 基石四：极速、解耦的推流处理 (SSEEventProcessor)

在最底层的通讯上，我们**直接使用原生 `fetch` 与 `ReadableStream`**，彻底规避了黑盒型高阶库（如 `@microsoft/fetch-event-source`）隐式的重连与不可预期的 Header 拦截问题。

同时，我们通过引入 `SSEEventProcessor`，**彻底解耦了“流协议边界解析层”与“React 状态合并层”**：

- **`SSEEventProcessor`** 内部封装基于 `eventsource-parser` 的纯净状态机，仅仅负责把网络裸二进制字符串流转化为明确的、具有业务语义的事件回调（如 `onMessageStart`）。它没有哪怕一丁点的 UI 视角或 React 依赖。
- **`useAdvancedChat`** 则作为使用方，将 `SSEEventProcessor` 实例化，用极其纯净的无底深拷贝（浅组合）逻辑安全地去修改那颗哈希树。极速纯净，规避了 `structuredClone` 每秒百次的性能惩罚。

---

## 🚧 补齐完整拼图的大厂级下一步 (TODO)

目前在这条纯净的通道中，我们仅打通了最为核心的**流式交互通道（/api/advanced-chat/:id/completion）**，证明了前端完全可以驾驭极致复杂的多卡片、多 Tool 生成的并行流引擎。
为了让该系统真正支撑大规模实战上线（即无缝嵌入 `/chat/$chatId` 全页面），建议逐步接通以下核心板块：

### 1. `ChatConversationMessages` 的全量零件映射

当前负责渲染卡片的组件（或者沙盒页面）需要被反哺回核心的 Chat Message 渲染入口中，对于每一个由于 `parts` 分片诞生的零件，适配并启用：

- Markdown / LaTeX 组件（用于 `text`）
- 带动画可折叠的展示盒（用于 `reasoning`）
- 真正高拓展的 ToolComponent Registry（根据 `tool_name` 差异化渲染 `tool_use` 与 `tool_result`）

### 2. 构建后端的真实 AI Node Gateway

当前的 `/completion` 为演示目的制造了完美模拟时序的伪造流。下一步应当连接真实的 LLM API（如 OpenAI 库的 Server Sent Stream），并将 LLM 发出的内部事件一一转化为我们设计的标准 `StreamEvent` 协议下发，由此真正贯通天地脉结。

### 3. 数据持久化策略对接

流媒体停止 (`content_block_stop`, `message_stop`) 时，确保后端将那一条完整的 `parts` Payload 转为纯 JSON 字符串扔进 PostgreSQL 等持久数据的 Text 字段中。

### 4. 完整的会话重载与 DB 建树 (CRUD 补齐)

如旧版文档所述，只需把 DB 中根据所属的对话拿出的散装 `Messages` 拉出来后，依据它们天生含有的 `parentId` 与 `role` 关系，在几毫秒内即可重新拼回这颗光彩熠熠的哈希多路树 `initialTree`。随后注入前端引擎，旧日平行宇宙瞬间重现。

---

_极客信仰：不再被重型 SDK 绑架！让所有的状态、网络控制与组件隔离如同手术刀般精准。_
