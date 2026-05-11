# chat-core 公共能力架构方案

## 一、目标

将 `session-chat` 中的核心能力提取为 `lib/chat-core`，使其成为 **session-chat、agent-editor 以及未来 agent 项目** 的共享基础设施。

### 必须达成

1. **保留 target + p/o/v patch 增量输出协议** — 所有项目统一使用此协议进行流式状态同步
2. **升级为 agent 架构** — 后端基于 `ai-sdk` 的 `streamText` + `tools`，支持多步工具调用
3. **web_search 作为内置工具** — 基于 Tavily，默认读取环境变量，也支持显式 config 覆盖
4. **Streamdown + Citation 作为内置 UI** — 默认提供 markdown 流式渲染和引用组件
5. **高度可扩展** — 每个项目可新增 tool、tool UI、自定义 markdown 组件，无需修改 core

### 明确不做

- 不抽象 `ChatSession`、`ChatMessage` 等业务模型 — 每个项目的状态结构不同
- 不抽象持久化层 — Prisma / 内存 / 其他由项目自己管
- 不提供 React Query hooks — query key、缓存策略因项目而异
- 不封装 LLM provider — 每个项目自己创建 `createDeepSeek()` 等

---

## 二、设计方案

### 2.1 窄腰架构

```
┌──────────────────────────────────────────────────────────┐
│  项目层（session-chat / agent-editor / drama-agent）        │
│                                                          │
│  ┌─ 前端 ──────────────────┐  ┌─ 后端 ──────────────────┐ │
│  │ Tool UI 组件             │  │ Tool 定义 + 执行         │ │
│  │ 业务 Hooks (React Query) │  │ 持久化 (Prisma/内存)     │ │
│  │ 自定义 Markdown 组件     │  │ System Prompt 构建       │ │
│  │ 页面布局 + 路由          │  │ 请求解析 + 路由          │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│  chat-core（窄腰 — 只做协议引擎 + 内置工具/UI）            │
│                                                          │
│  ┌─ 前端 ─────────────────────────────────────────┐      │
│  │ patch-apply     — target + p/o/v 补丁执行引擎   │      │
│  │ stream-parser   — SSE 事件 → immer 状态更新     │      │
│  │ stream-consumer — ReadableStream 消费循环       │      │
│  │ citation-utils  — 从 fragments 提取引用         │      │
│  │ UI: ChatResponse, SearchFragmentView,           │      │
│  │     FragmentRenderer, GenericToolView            │      │
│  └─────────────────────────────────────────────────┘      │
│                                                          │
│  ┌─ 后端 ─────────────────────────────────────────┐      │
│  │ sse            — SSE 传输工具函数               │      │
│  │ patch-emitter  — target + p/o/v 补丁发射器      │      │
│  │ citation       — citation 标签规范化             │      │
│  │ stream-bridge  — ai-sdk fullStream → patch 翻译 │      │
│  │ tools/web-search — 内置 Tavily 搜索工具         │      │
│  └─────────────────────────────────────────────────┘      │
│                                                          │
│  ┌─ 共享 ─────────────────────────────────────────┐      │
│  │ types          — 协议类型 + Fragment 基础类型    │      │
│  └─────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

### 2.2 核心数据流

#### 后端：请求 → ai-sdk → target + p/o/v → SSE

```
Request
  │
  ▼
[项目 Handler]                    ← 项目代码：请求解析、持久化、构造 tools
  │
  ├─ 初始化 assistant response        ← 项目代码：发送 data.v.response，建立 patch 目标
  │
  ├─ streamText({ tools, prompt })   ← ai-sdk v6
  │    │
  │    ▼
  │  fullStream (text-delta / tool-call / tool-result / finish)
  │    │
  │    ▼
  ├─ bridgeAIStreamToPatches()       ← core: 翻译为 target + p/o/v patch
  │    │
  │    ▼
  ├─ PatchEmitter.sendPatch()        ← core: 发射 SSE 帧
  │    │
  │    ▼
  └─ SSE Response (target + p/o/v frames)
```

#### 前端：SSE → patch → 状态 → UI

```
SSE Response
  │
  ▼
consumePatchStream()               ← core: ReadableStream → TextDecoder → parser.feed
  │
  ▼
createPatchStreamParser()          ← core: eventsource-parser → applyStreamData
  │
  ├─ 命名事件 (ready/error/close)  ← 回调给项目 handler
  │
  └─ 数据帧 (target + p/o/v)      ← core: resolve target + applyPathPatch → immer produce → 新状态
       │
       ▼
  [项目 UI]
       │
       ├─ FragmentRenderer          ← core: 路由到对应 fragment 组件
       │    ├─ SearchFragmentView   ← core 内置: web_search
       │    ├─ GenericToolView      ← core 内置: 未知工具 fallback
       │    └─ [Custom]             ← 项目注入: customRenderers
       │
       └─ ChatResponse              ← core 内置: Streamdown + Citation
            ├─ CitationTag          ← core 内置
            └─ [Custom components]  ← 项目注入: components prop
```

### 2.3 Fragment 状态模型（工具调用生命周期）

一个 assistant 消息的 `fragments[]` 按时间序保存所有阶段：

```
fragments: [
  { type: "TOOL_CALL", tool_name: "web_search", status: "FINISHED",
    tool_input: { query: "..." }, tool_output: { queries: [...], results: [...] } },
  { type: "RESPONSE", content: "根据搜索结果..." }
]
```

多工具交错（agent 多步推理）：

```
fragments: [
  { type: "TOOL_CALL", tool_name: "web_search",        status: "FINISHED", ... },
  { type: "RESPONSE", content: "初步分析..." },
  { type: "TOOL_CALL", tool_name: "generate_character", status: "FINISHED", ... },
  { type: "RESPONSE", content: "最终结论..." }
]
```

对应的初始化帧与 target + p/o/v 补丁序列（后端 stream-bridge 生成）：

```jsonc
// 0. 初始化 assistant response（必须先发，后续 patch 才有目标）
{ "v": { "response": {
    "message_id": 2, "parent_id": 1, "role": "ASSISTANT",
    "status": "WIP", "fragments": [], "has_pending_fragment": false
}}}

// 1. 工具调用开始
{ "t": { "type": "response" }, "p": "fragments", "o": "APPEND", "v": {
    "id": 1, "type": "TOOL_CALL", "tool_name": "web_search",
    "status": "WIP", "tool_call_id": "call_abc",
    "tool_input": { "query": "最新消息" }, "tool_output": null
}}

// 2. 工具执行完成
{ "t": { "type": "fragment", "id": 1 }, "p": "tool_output", "o": "SET", "v": { "queries": [...], "results": [...] } }
{ "t": { "type": "fragment", "id": 1 }, "p": "status", "o": "SET", "v": "FINISHED" }

// 3. 文本响应开始
{ "t": { "type": "response" }, "p": "fragments", "o": "APPEND", "v": {
    "id": 2, "type": "RESPONSE", "content": "", "references": []
}}

// 4. 文本流式输出
{ "t": { "type": "fragment", "id": 2 }, "p": "content", "o": "APPEND", "v": "根据" }
{ "v": "搜索结果" }  // 续传：省略 p/o，复用上一帧
{ "v": "，<citation cite_index=\"1\">1</citation>..." }
```

补丁帧统一使用 `t` 定位目标，`p` 只表示目标对象内部路径。`APPEND fragments` 的目标是当前 assistant response；更新 fragment 内容、状态、tool output 时目标是稳定 fragment id。续传帧复用上一帧的 `t/p/o`。

### 2.4 可扩展性设计

| 扩展场景 | 做法 | 改 core？ |
|---|---|---|
| 新增后端 tool | handler 的 `streamText({ tools: { ... } })` 加一个 | ❌ |
| 新增 tool 前端 UI | `<FragmentRenderer customRenderers={{ my_tool: MyToolUI }} />` | ❌ |
| 覆盖内置搜索 UI | `customRenderers` 中 key 为 `web_search` | ❌ |
| 自定义 markdown 标签 | `<ChatResponse components={{ myTag: MyTag }} />` | ❌ |
| 追加 streamdown plugin | `<ChatResponse plugins={{ mermaid }} />` | ❌ |
| 覆盖 citation 样式 | `<ChatResponse components={{ citation: MyCitation }} />` | ❌ |
| 不要 web_search | handler 的 `tools` 不包含它 | ❌ |
| 自定义 system prompt | handler 内自己构造 | ❌ |
| 换 DB | handler 内自己写持久化 | ❌ |
| 换 LLM provider | handler 内自己创建 model | ❌ |

### 2.5 持久化与历史恢复约定

core 不抽象 DB，但 `TOOL_CALL` fragment 需要项目持久化以下语义字段，保证刷新、重放和历史加载后 UI 仍可渲染：

```ts
interface PersistedToolCallFragment {
  id: number | string;              // 当前 assistant message 内稳定 id
  type: "TOOL_CALL";
  status: "WIP" | "FINISHED" | "FAILED" | string;
  tool_name: string;
  tool_call_id: string;
  tool_input: unknown;
  tool_output: unknown;
}
```

`session-chat` 迁移时需要把现有 `SEARCH` 持久化模型扩展为通用 tool fragment：

- `MessageFragment` 增加 `toolName`、`toolCallId`、`toolInputJson`、`toolOutputJson`
- 历史序列化将 `TOOL_CALL` 输出为 `tool_name/tool_call_id/tool_input/tool_output/status`
- 旧 `SEARCH` 历史可在读取时映射为 `TOOL_CALL + tool_name=web_search`，`queries/results` 放入 `tool_output`
- `extractCitationsFromFragments` 同时支持旧 `SEARCH.results` 与新 `TOOL_CALL(web_search).tool_output.results`
- 新写入统一落 `TOOL_CALL`，避免继续扩大 `SEARCH` 特例

---

## 三、文件结构与代码来源

### 3.1 `lib/chat-core/` 完整结构

```
lib/chat-core/
├── types.ts                        # 协议类型 + Fragment 基础类型
├── server/
│   ├── sse.ts                      # SSE 传输
│   ├── patch-emitter.ts            # target + p/o/v 补丁发射
│   ├── citation.ts                 # citation 规范化
│   ├── stream-bridge.ts            # ai-sdk → target + p/o/v 翻译（★ 新增）
│   └── tools/
│       └── web-search.ts           # 内置 Tavily 搜索工具
├── client/
│   ├── patch-apply.ts              # 补丁执行引擎
│   ├── stream-parser.ts            # SSE → 状态更新
│   ├── stream-consumer.ts          # ReadableStream 消费
│   └── citation-utils.ts           # 从 fragments 提取引用
├── ui/
│   ├── chat-response.tsx           # Streamdown + Citation（★ 可扩展）
│   ├── search-fragment.tsx         # 搜索结果 UI（★ 可覆盖）
│   ├── tool-fragment.tsx           # 通用工具 fallback UI（★ 新增）
│   ├── fragment-renderer.tsx       # Fragment 路由（★ 可扩展）
│   └── index.ts                    # 统一导出
└── index.ts                        # 统一导出
```

### 3.2 每个文件的代码来源

#### `types.ts` — 混合提取 + 新增

```ts
// ---- 从 features/session-chat/types.ts 提取 ----
export type ChatPatchOperation = "APPEND" | "SET" | "BATCH";

export type ChatPatchTarget =
  | { type: "response" }
  | { type: "fragment"; id: string | number };

export interface ChatStreamPatch {
  /** 补丁目标：response 表示当前 assistant 消息，fragment 表示该消息下的稳定 fragment */
  t?: ChatPatchTarget;
  /** 目标对象内部路径 */
  p?: string;
  o?: ChatPatchOperation;
  v?: unknown;
}

export interface ChatStreamPatchContext {
  responseMessageId: number | null;
  responseMessageIndex: number | null;
  lastTarget: ChatPatchTarget | null;
  lastPath: string | null;
  lastOperation: ChatPatchOperation | null;
}

// ---- 从 src/server/session-chat/chat-completion.ts 提取 ----
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

export interface WebSearchPayload {
  queries: SearchQueryPayload[];
  results: SearchResultPayload[];
}

export type WebSearchFn = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<WebSearchPayload>;

// ---- 从 src/components/ai-elements/message.tsx 提取 ----
export interface MessageCitation {
  cite_index: number;
  url: string;
  title?: string;
  site_name?: string;
}

// ---- 新增：Fragment 基础类型 ----
export interface CoreFragment {
  id: number;
  type: string;
  status?: string;
  content?: string | null;
  // 工具调用字段
  tool_name?: string;
  tool_call_id?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  // web_search 内置字段
  queries?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
}
```

#### `server/sse.ts` — 整体搬移

来源：`src/server/http/sse.ts`（全部 47 行），原样搬入。

```
SSE_HEADERS, sendSseEvent, sendSseFrame, createSseResponse
```

#### `server/patch-emitter.ts` — 从 chatCompletionHandler 提取

来源：`src/server/session-chat/chat-completion.ts` 行 607-639

```ts
export interface PatchEmitter {
  sendPatch(patch: ChatStreamPatch & { t: ChatPatchTarget; p: string }): void;
  sendFullData(data: object | string): void;
  sendEventFrame(frame: { event: string; data: object | string }): void;
}

export function createPatchEmitter(
  controller: ReadableStreamDefaultController,
): PatchEmitter {
  const encoder = new TextEncoder();
  let lastPatchTarget: ChatPatchTarget | null = null;
  let lastPatchPath: string | null = null;
  let lastPatchOperation: string | null = null;

  const isSamePatchTarget = (a: ChatPatchTarget, b: ChatPatchTarget | null) =>
    b !== null && a.type === b.type && ("id" in a ? a.id : null) === ("id" in b ? b.id : null);

  const resetPatchContext = () => {
    lastPatchTarget = null;
    lastPatchPath = null;
    lastPatchOperation = null;
  };

  return {
    sendPatch(patch) {
      // 续传优化：target + path + operation 相同时只发 { v }
      const operation = patch.o ?? null;
      if (
        isSamePatchTarget(patch.t, lastPatchTarget) &&
        patch.p === lastPatchPath &&
        operation === lastPatchOperation
      ) {
        sendSseEvent(controller, encoder, { v: patch.v });
        return;
      }
      lastPatchTarget = patch.t;
      lastPatchPath = patch.p;
      lastPatchOperation = operation;
      sendSseEvent(controller, encoder, patch);
    },
    sendFullData(data) {
      resetPatchContext();
      sendSseEvent(controller, encoder, data);
    },
    sendEventFrame(frame) {
      resetPatchContext();
      sendSseFrame(controller, encoder, frame);
    },
  };
}
```

#### `server/citation.ts` — 从 chatCompletionHandler 提取

来源：`src/server/session-chat/chat-completion.ts` 行 462-513

```
normalizeCitationTags(value: string): string
extractFlushableCitationMarkdown(buffer: string): { flush: string; hold: string }
```

#### `server/tools/web-search.ts` — 提取 + 封装 ai-sdk tool

来源：`src/server/session-chat/chat-completion.ts` 行 66-243

提取的纯函数：
```
toSearchQueryPayload, getSiteName, getEpochSeconds, toSearchResultPayload
runTavilySearch
buildSearchSystemPrompt
```

新增的 ai-sdk tool 封装：
```ts
import { tool } from "ai";
import { z } from "zod";

export interface WebSearchToolConfig {
  apiKey?: string;
  baseUrl?: string;
  maxResults?: number;
}

export function createWebSearchTool(config: WebSearchToolConfig = {}) {
  return tool({
    description: "搜索网络获取最新信息",
    inputSchema: z.object({
      query: z.string().describe("搜索关键词"),
    }),
    execute: async ({ query }, { abortSignal }) => {
      return runTavilySearch(query, { signal: abortSignal, ...config });
    },
  });
}
```

配置约定：
- `apiKey` 默认读取 `process.env.TAVILY_API_KEY`
- `baseUrl` 默认读取 `process.env.TAVILY_API_BASE_URL`，缺省为 `https://api.tavily.com`
- `maxResults` 默认使用 core 常量 `DEFAULT_TAVILY_MAX_RESULTS`
- 缺少 API key 时，工具执行抛出明确错误；项目可在 handler 层决定禁用 `web_search`、返回错误事件或降级为普通对话
- 调用方传入的 `WebSearchToolConfig` 优先级高于环境变量
- “内置”表示 core 提供工具工厂、payload 规范和默认 UI；可用性仍取决于项目运行环境是否提供 Tavily 凭证

#### `server/stream-bridge.ts` — 全新编写（★ 核心新增）

这是整个方案最关键的新增文件。翻译 ai-sdk 的 fullStream 事件为 target + p/o/v 补丁。

```ts
import type { PatchEmitter } from "./patch-emitter";
import { normalizeCitationTags, extractFlushableCitationMarkdown } from "./citation";

interface StreamBridgeOptions {
  emitter: PatchEmitter;
  /** 初始化项目自己的 assistant response，并通过 emitter.sendFullData({ v: { response } }) 发给前端 */
  ensureResponseInitialized: () => void | Promise<void>;
  /** 是否缓冲 citation 标签（防止流式切断） */
  citationBuffering?: boolean;
  /** 工具调用时的回调（用于项目特定逻辑如持久化） */
  onToolCall?: (toolName: string, toolCallId: string, args: unknown) => void | Promise<void>;
  /** 工具结果到达时的回调 */
  onToolResult?: (toolCallId: string, result: unknown) => void | Promise<void>;
  /** 文本内容追加时的回调（用于持久化） */
  onContentAppend?: (content: string, totalContent: string) => void | Promise<void>;
  /** 流结束时的回调 */
  onFinish?: (usage: { totalTokens: number }) => void | Promise<void>;
}

export async function bridgeAIStreamToPatches(
  fullStream: AsyncIterable<any>,
  options: StreamBridgeOptions,
) {
  const { emitter, citationBuffering = true } = options;
  let citationBuffer = "";
  let totalContent = "";
  let nextFragmentId = 1;
  let currentResponseFragmentId: number | null = null;
  const toolFragmentIdByCallId = new Map<string, number>();

  await options.ensureResponseInitialized();

  // 确保文本 fragment 已创建
  const ensureResponseFragment = (): number => {
    if (currentResponseFragmentId !== null) return currentResponseFragmentId;
    const fragmentId = nextFragmentId++;
    currentResponseFragmentId = fragmentId;
    emitter.sendPatch({
      t: { type: "response" },
      p: "fragments",
      o: "APPEND",
      v: { id: fragmentId, type: "RESPONSE", content: "", references: [] },
    });
    return fragmentId;
  };

  const flushContent = (text: string) => {
    if (!text) return;
    const fragmentId = ensureResponseFragment();
    totalContent += text;
    emitter.sendPatch({
      t: { type: "fragment", id: fragmentId },
      p: "content",
      o: "APPEND",
      v: text,
    });
    options.onContentAppend?.(text, totalContent);
  };

  for await (const part of fullStream) {
    switch (part.type) {
      case "text-delta": {
        if (citationBuffering) {
          citationBuffer += part.text;
          const { flush, hold } = extractFlushableCitationMarkdown(citationBuffer);
          citationBuffer = hold;
          flushContent(flush);
        } else {
          flushContent(part.text);
        }
        break;
      }

      case "tool-call": {
        // 在工具调用前结束当前文本 fragment（如果有）
        currentResponseFragmentId = null;
        const fragmentId = nextFragmentId++;
        toolFragmentIdByCallId.set(part.toolCallId, fragmentId);

        // 发送 TOOL_CALL fragment
        emitter.sendPatch({
          t: { type: "response" },
          p: "fragments",
          o: "APPEND",
          v: {
            id: fragmentId,
            type: "TOOL_CALL",
            tool_name: part.toolName,
            tool_call_id: part.toolCallId,
            status: "WIP",
            tool_input: part.input,
            tool_output: null,
          },
        });
        await options.onToolCall?.(part.toolName, part.toolCallId, part.input);
        break;
      }

      case "tool-result": {
        const fragmentId = toolFragmentIdByCallId.get(part.toolCallId);
        if (fragmentId === undefined) break;

        // 更新对应 TOOL_CALL fragment 的输出和状态
        emitter.sendPatch({
          t: { type: "fragment", id: fragmentId },
          p: "tool_output",
          o: "SET",
          v: part.output,
        });
        emitter.sendPatch({
          t: { type: "fragment", id: fragmentId },
          p: "status",
          o: "SET",
          v: "FINISHED",
        });
        await options.onToolResult?.(part.toolCallId, part.output);
        break;
      }

      case "finish": {
        // 刷新 citation 缓冲区残留
        if (citationBuffer) {
          const flush = normalizeCitationTags(citationBuffer);
          flushContent(flush);
          citationBuffer = "";
        }
        await options.onFinish?.({ totalTokens: part.totalUsage?.totalTokens ?? 0 });
        break;
      }
    }
  }
}
```

#### `client/patch-apply.ts` — 从 parser.ts 提取

来源：`features/session-chat/stream/parser.ts` 行 115-186

```
resolveArrayIndex(array, segment): number | null
applyPathPatch(target, path, operation, value): void
```

纯函数，无任何业务依赖。

#### `client/stream-parser.ts` — 从 parser.ts 提取 + 泛化

来源：`features/session-chat/stream/parser.ts` 行 223-271（applyStreamData）+ 行 33-46（类型守卫）

```ts
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { produce } from "immer";
import { applyPathPatch } from "./patch-apply";

export interface PatchStreamParserOptions<TState> {
  /** 状态更新回调 */
  updateState: (updater: (state: TState | undefined) => TState | undefined) => void;
  /** 命名事件处理（ready, update_session, title, error, close 等） */
  onEvent?: (eventName: string, data: unknown) => void;
  /** 判断数据帧中的 response 对象（用于初始化消息） */
  isResponseMessage?: (value: unknown) => boolean;
  /** 从 response 对象获取 message_id */
  getResponseMessageId?: (value: unknown) => number | null;
  /** 将 response 对象 upsert 到状态 */
  upsertResponse?: (draft: TState, response: unknown) => void;
  /** 根据 t 定位补丁目标；response 返回当前 assistant 消息，fragment 返回该消息下的指定 fragment */
  resolvePatchTarget: (draft: TState, target: ChatPatchTarget) => unknown | null;
  /** patch context — 调用方管理 */
  patchContext: ChatStreamPatchContext;
}

export function createPatchStreamParser<TState>(options: PatchStreamParserOptions<TState>) {
  return createParser({
    onEvent: (event: EventSourceMessage) => {
      if (!event.data) return;
      const data = JSON.parse(event.data);

      // 命名事件 → 转发给项目
      if (event.event) {
        options.onEvent?.(event.event, data);
        return;
      }

      // 数据帧 → target + p/o/v 补丁
      options.updateState((currentState) =>
        applyStreamData(currentState, options, data),
      );
    },
  });
}
```

#### `client/stream-consumer.ts` — 从 stream.ts 提取

来源：`features/session-chat/stream/stream.ts` 行 56-68

```ts
export async function consumePatchStream(
  response: Response,
  parser: { feed: (chunk: string) => void },
): Promise<void> {
  if (!response.body) return;

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(value);
  }
}
```

#### `client/citation-utils.ts` — 从 chat-message-list.tsx 提取

来源：`features/session-chat/components/chat-message-list.tsx` 行 43-64

```ts
export function extractCitationsFromFragments(fragments: CoreFragment[]): MessageCitation[]
```

#### `ui/chat-response.tsx` — 从 message.tsx 提取 + 增强可扩展性

来源：`src/components/ai-elements/message.tsx` 行 319-428

改动：
- 重命名 `MessageResponse` → `ChatResponse`
- `plugins` prop：默认 `{ cjk, code, math }`，用户传入的做 merge
- `components` prop：默认包含 `citation`，用户传入的做 merge（用户可覆盖 citation）
- 导出 `CitationTag`、`defaultStreamdownPlugins` 供项目独立使用

```tsx
export interface ChatResponseProps extends ComponentProps<typeof Streamdown> {
  citations?: MessageCitation[];
  components?: Record<string, React.ComponentType<any>>;
  plugins?: Record<string, any>;
}

export const ChatResponse = memo(({ citations, components, plugins, ...props }: ChatResponseProps) => {
  // 默认 components 包含 citation → 与用户 components 合并
  // 默认 plugins 包含 cjk+code+math → 与用户 plugins 合并
  // ...
});
```

#### `ui/search-fragment.tsx` — 从 chat-message-list.tsx 提取

来源：`features/session-chat/components/chat-message-list.tsx` 行 66-128

改动：
- 增加 `renderResult` prop 允许覆盖单条结果渲染
- 增加 `className` prop

```tsx
export interface SearchFragmentViewProps {
  fragment: CoreFragment;
  className?: string;
  renderResult?: (result: Record<string, unknown>, index: number) => ReactNode;
}

export function SearchFragmentView({ fragment, className, renderResult }: SearchFragmentViewProps) {
  // 现有逻辑 + renderResult 覆盖
}
```

#### `ui/tool-fragment.tsx` — 全新编写

通用工具 fallback UI。当 `FragmentRenderer` 遇到没有自定义渲染器的 TOOL_CALL 时使用。

```tsx
export function GenericToolView({ fragment }: { fragment: CoreFragment }) {
  // 显示：工具名 + 状态指示 + JSON 折叠的 input/output
}
```

#### `ui/fragment-renderer.tsx` — 全新编写（★ 扩展入口）

```tsx
export interface FragmentRendererProps {
  fragment: CoreFragment;
  /** 项目自定义渲染器，key 为 tool_name，优先级高于内置 */
  customRenderers?: Record<string, React.ComponentType<{ fragment: CoreFragment }>>;
  /** 传给内置 SearchFragmentView 的 props */
  searchFragmentProps?: Partial<SearchFragmentViewProps>;
}

export function FragmentRenderer({ fragment, customRenderers, searchFragmentProps }: FragmentRendererProps) {
  // 1. TOOL_CALL 类型 → 查 customRenderers[tool_name] → 查内置 → GenericToolView
  // 2. 其他类型 → 返回 null（文本由上层 ChatResponse 渲染）
  if (fragment.type === "TOOL_CALL" && fragment.tool_name) {
    const Custom = customRenderers?.[fragment.tool_name];
    if (Custom) return <Custom fragment={fragment} />;

    if (fragment.tool_name === "web_search") {
      return <SearchFragmentView fragment={fragment} {...searchFragmentProps} />;
    }

    return <GenericToolView fragment={fragment} />;
  }

  return null;
}
```

---

## 四、实施步骤

### Phase 1: 创建 core 基础层（无破坏性改动）

| 步骤 | 动作 | 来源 |
|---|---|---|
| 1.1 | 创建 `lib/chat-core/types.ts` | 提取自 `features/session-chat/types.ts` + `chat-completion.ts` + `message.tsx` |
| 1.2 | 创建 `lib/chat-core/server/sse.ts` | 搬移自 `src/server/http/sse.ts` |
| 1.3 | 创建 `lib/chat-core/server/patch-emitter.ts` | 提取自 `chat-completion.ts:607-639` |
| 1.4 | 创建 `lib/chat-core/server/citation.ts` | 提取自 `chat-completion.ts:462-513` |
| 1.5 | 创建 `lib/chat-core/client/patch-apply.ts` | 提取自 `parser.ts:115-186` |
| 1.6 | 创建 `lib/chat-core/client/stream-parser.ts` | 提取自 `parser.ts:223-271` + 泛化 |
| 1.7 | 创建 `lib/chat-core/client/stream-consumer.ts` | 提取自 `stream.ts:56-68` |
| 1.8 | 创建 `lib/chat-core/client/citation-utils.ts` | 提取自 `chat-message-list.tsx:43-64` |

### Phase 2: 内置工具 + 内置 UI

| 步骤 | 动作 | 来源 |
|---|---|---|
| 2.1 | 创建 `lib/chat-core/server/tools/web-search.ts` | 提取自 `chat-completion.ts:66-243` + 新增 `createWebSearchTool` |
| 2.2 | 创建 `lib/chat-core/server/stream-bridge.ts` | ★ 全新编写 |
| 2.3 | 创建 `lib/chat-core/ui/chat-response.tsx` | 提取自 `message.tsx:319-428` + 增强 |
| 2.4 | 创建 `lib/chat-core/ui/search-fragment.tsx` | 提取自 `chat-message-list.tsx:66-128` + 增强 |
| 2.5 | 创建 `lib/chat-core/ui/tool-fragment.tsx` | ★ 全新编写 |
| 2.6 | 创建 `lib/chat-core/ui/fragment-renderer.tsx` | ★ 全新编写 |
| 2.7 | 创建统一导出 `index.ts` | - |

### Phase 3: session-chat 迁移到 core

| 步骤 | 动作 |
|---|---|
| 3.1 | `features/session-chat/types.ts` — `ChatFragment` 扩展 tool 字段，引用 core 协议类型 |
| 3.2 | `prisma/schema.prisma` — `MessageFragment` 增加 `toolName/toolCallId/toolInputJson/toolOutputJson` |
| 3.3 | `src/server/session-chat/history-messages.ts` — 序列化 `TOOL_CALL` 字段，并兼容旧 `SEARCH` |
| 3.4 | `features/session-chat/stream/parser.ts` — 将 `applyPathPatch`、`resolveArrayIndex` 替换为 core 导入，接入 `resolvePatchTarget` |
| 3.5 | `features/session-chat/stream/stream.ts` — 将 stream 消费循环替换为 core 的 `consumePatchStream` |
| 3.6 | `src/server/http/sse.ts` — 改为 re-export `lib/chat-core/server/sse` |
| 3.7 | `src/server/session-chat/chat-completion.ts` — 重构为使用 core 的 patch-emitter + stream-bridge + web-search，新增写入 `TOOL_CALL` |
| 3.8 | `features/session-chat/components/chat-message-list.tsx` — 使用 core 的 `FragmentRenderer` + `ChatResponse` |

### Phase 4: 验证 + 测试

| 步骤 | 动作 |
|---|---|
| 4.1 | 现有 session-chat 功能完整可用（网络搜索 + 对话） |
| 4.2 | 新增 TOOL_CALL fragment 的渲染验证 |
| 4.3 | 验证 agent-editor 可导入 core 组件 |

---

## 五、关键设计决策记录

### D1: 为什么 Fragment 不独立为 `tools[]`

工具调用放在 `fragments[]` 里而非独立的 `tools[]` 数组：
- target + p/o/v 协议统一（`t` 定位 response/fragment，`p` 定位对象内部字段）
- 工具与文本的交错顺序天然保留
- 前端渲染只需遍历 fragments，一个 loop 搞定

### D2: 为什么 web_search 是 TOOL_CALL 而非保留 SEARCH

升级后 SEARCH 类型迁移为 `TOOL_CALL + tool_name=web_search`：
- 统一工具模型，减少特殊分支
- SEARCH 类型保留向后兼容（FragmentRenderer 内部可同时处理两者）

### D3: 为什么不提供 `useChatCompletion` hook 在 core

每个项目的 hook 差异极大：
- session-chat: useMutation + React Query 缓存 + optimistic update + session list 联动
- agent-editor: useReducer + 纯内存 + 无缓存
- 未来项目: 可能用 zustand 或其他

强行统一 hook 只会增加抽象成本。core 提供零件（parser + consumer），项目自己组装 hook。

### D4: 为什么 stream-bridge 用回调而非返回值

```ts
bridgeAIStreamToPatches(fullStream, {
  emitter,
  onToolCall,      // ← 回调
  onContentAppend, // ← 回调
  onFinish,        // ← 回调
})
```

因为项目需要在这些时机做持久化、发额外 SSE 事件等。回调方式让项目在不修改 bridge 的情况下插入自己的逻辑。

### D5: 为什么 UI 用 props merge 而非 registry

```tsx
// ❌ Registry 模式
FragmentRegistry.register("web_search", SearchView);

// ✅ Props 模式
<FragmentRenderer customRenderers={{ web_search: MySearchView }} />
```

Registry 是全局状态，难以测试和 SSR。Props 是 React 的标准模式，组件树内可见，无隐式依赖。
