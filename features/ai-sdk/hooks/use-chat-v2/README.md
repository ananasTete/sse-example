# useChatV2 架构设计与实现

`useChatV2` 是一个用于处理复杂 AI 对话状态和流式更新（Server-Sent Events）的 React Hook。经过 2026 年初的重构，该服务已完全脱离传统的 `useReducer` + 海量 `useRef` 的“面条代码”（Spaghetti Code）设计，转向了基于 **面向核心对象 (Core Engine)** 与 **单纯数据绑定 (Thin Hook Wrapper)** 的现代架构。

## 为什么进行大规模重构？

早期的 `useChatV2` 将以下所有职责耦合在一个包含 500 多行的 Hook 文件中：

1. **网络层通信**：发起请求、建立 SSE 连接、处理异常错误中断。
2. **断点续传与重试**：基于 Sequence Number (seq) 的断连自动休眠拉起。
3. **复杂状态管理**：使用 `useReducer` 维护错综复杂的树状对话历史（Graph Conversation State）。
4. **React UI 生命周期捆绑**：重度依赖 7~8 个不可控的 `useRef` 控制网络状态逃逸，并在网络层内部到处传递 `dispatch`。

这种紧耦合导致：调试困难（无法区分是 React 渲染 BUG 还是网络 BUG）、容易发生竞态条件、代码可读性极差。

## 新架构概览

新架构采用了清晰的分层设计，主要分为两层：**Pure TypeScript 核心引擎层 (Core Engine)** 和 **React 观察者层 (React Hook Layer)**。

```text
┌─────────────────────────────────────────────────────────────┐
│                       React Component                       │
│  (UI Components, Inputs, Render Chat Messages)              │
└──────────────┬─────────────────────────────▲────────────────┘
               │ 调用方法                      │ 响应式快照
               │ (sendMessage, stop)           │ (useSyncExternalStore)
┌──────────────▼─────────────────────────────┴────────────────┐
│      useChatV2 Hook (features/ai-sdk/hooks/use-chat-v2/)    │
│  (实例化 Engine, 生命周期绑定 onMount / destroy)            │
└──────────────┬─────────────────────────────▲────────────────┘
               │                               │ 事件通知
┌──────────────▼─────────────────────────────┴────────────────┐
│               ChatEngine Facade (core/chat-engine.ts)       │
│  (统筹网络连接逻辑、重试调度、异常捕捉与请求发起)           │
├──────────────────────────────┬──────────────────────────────┤
│        Engine State (1)      │      Engine Network (2)      │
│  (chat-engine-state.ts)      │ (chat-engine-connect.ts等)   │
│  - 继承 EventTarget          │ - SSE 流式解析器             │
│  - 维护深层对话 Tree         │ - AbortController 超时打断   │
│  - 负责状态快照缓存          │ - Seq 序列回溯与自动重新拉取 │
└──────────────────────────────┴──────────────────────────────┘
```

### 1. 核心状态机：`ChatEngineState`

所在位置：`core/chat-engine-state.ts`

- **基于 EventTarget**：内部继承了浏览器的 `EventTarget` 事件范式。所有的底层网络事件只需要无脑调用类似 `engineState.updateAssistantMessage()` 的原生方法即可。当内部状态发生改变，它会通过原生 Event 机制分发一条 `change` 通知。
- **快照缓存 (Snapshot Caching)**：完全接管了复杂对象的不可变性更新体验。其 `getSnapshot()` 返回一个完全被缓存的普通对象。这有效阻止了深层不可变更新所带来的 React StrictMode 无限死循环 `Maximum update depth exceeded` 恐慌。

### 2. 网络大脑：`ChatEngineConnect` / `ChatEngineStream`

所在位置：`core/chat-engine-connect.ts` 和 `core/chat-engine-stream.ts`

- **与 React 彻底解耦**：这是这套重构的最核心价值。现在请求和中断都不需要从外面的 React 组件“借” `abortControllerRef`。这些控制流完全封装在引擎内部私有的 `private streamController` 里。
- **断点续传（Reliability Layer）**：
  - 如果遭遇网络抖动或切换 Wi-Fi：系统会捕获流 `EOF`或读取级报错。
  - 进行自动对齐分析：通过拉取服务端历史（Recover snapshot）校对 `lastSeq`，发现缺少的块。
  - 带回退延时（指数退避算法）安全地复用 `resumeToken` 再次 `fetch` 建立 SSE。

### 3. 轻量化大门：`useChatV2` Hook

所在位置：`hooks/use-chat-v2/useChatV2.ts`
重构后的主 Hook 瘦身到仅约 60 行，完全遵循了 MVC 的视图黏合原则：

```typescript
export function useChatV2(options: ChatEngineOptions) {
  // 1. 单例模式初始化 Engine
  const engineRef = useRef<ChatEngine | null>(null);
  if (!engineRef.current) engineRef.current = new ChatEngine(options);
  const engine = engineRef.current;

  // 2. 将 EventTarget 事件同步到 React Scheduler
  const snapshot = useSyncExternalStore(
    useCallback((onStoreChange) => engine.subscribe(onStoreChange), [engine]),
    () => engine.getSnapshot(),
  );

  // 3. 安全应对 React 18 Strict Mode 生命周期
  useEffect(() => {
    return () => engine.destroy();
  }, [engine]);

  useEffect(() => {
    engine.onMount(options.initialActiveRun);
  }, [engine, options.chatId, options.initialActiveRun]);

  // 4. 对外挂载操作与数据字典
  return {
    ...snapshot,
    sendMessage: (content) => engine.sendMessage(content),
    stop: () => engine.stop(),
  };
}
```

## 生命周期与断点续传特性 (Resume on Reload)

得益于这次重构成纯粹的面向对象范式，断点续传可以在严苛的环境（例如用户在回复打字打到一半时按下 `F5` 刷新网页，或 React Strict Mode 强制注销并立刻挂载组件）优雅度过。

当 React 再次执行 `engine.onMount()` 并传回尚未完结的 `initialActiveRun`（或发现本地具有 `hasStreamingAssistantParts` 的遗留快照树）时：

1. 引擎会挂起 UI 的显示，不抹除旧消息。
2. 引擎异步访问服务器补齐缺失的这段 `seq`。
3. 从最后一个断点重新发起一模一样的流式请求并无缝拼接剩下的字。

从此你永远不需要在这几百行核心逻辑里放一个会导致诡异重新渲染的 `console.log`，你可以在任何一个独立职责（网络/解析/状态）的 vanilla class 里下断点进行轻松排查。
