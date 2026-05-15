# features/session-chat

基于 `lib/chat-core` 的完整聊天会话功能模块，包含前端 UI、状态管理、SSE 流消费，以及对应的服务端实现（位于 `src/server/session-chat/`）。

## 目录结构

```
features/session-chat/
├── types.ts                          # 领域类型（re-export + 扩展 chat-core 类型）
├── components/
│   ├── chat-layout.tsx               # 根布局：SidebarProvider + ChatSidebar + SidebarInset
│   ├── chat-sidebar.tsx              # 会话列表侧边栏，含无限滚动加载
│   ├── chat-index-view.tsx           # 新会话首页（消费 draft session，发消息后跳转详情）
│   ├── chat-detail-view.tsx          # 会话详情页（消息列表 + 输入框 + 自动 resume）
│   ├── chat-message-list.tsx         # 消息列表渲染（USER/ASSISTANT，含 citations）
│   └── chat-prompt-input.tsx         # 输入框组件（含网络搜索开关）
├── hooks/
│   ├── keys.ts                       # TanStack Query key 工厂
│   ├── index.ts                      # hooks 统一导出
│   ├── useChatCompletion.ts          # 发消息 + resume 的 useMutation（含乐观更新）
│   ├── useChatSessionList.ts         # 会话列表无限查询 + 缓存更新工具函数
│   ├── useChatSessionQuery.ts        # 单个会话历史消息查询
│   ├── useCreateChatSessionMutation.ts # 创建会话 mutation
│   └── useDraftSession.ts            # 预创建会话（首页用，consume 后跳转）
└── stream/
    ├── index.ts                      # re-export
    ├── parser.ts                     # createChatCompletionParser（包装 chat-core stream-parser）
    ├── stream.ts                     # processChatCompletionStream（组装 parser + consumePatchStream）
    └── messages.ts                   # createUserMessage / upsertMessage 工具函数
```

服务端（独立目录，与本 feature 配套）：

```
src/server/session-chat/
├── chat-completion.ts   # POST /chat/completion + POST /api/v0/chat/resume_stream
│                        # 管理 activeCompletionControllers（内存多订阅者 fan-out）
│                        # 调用 bridgeAIStreamToPatches，持久化消息到 DB
├── chat-session.ts      # POST /api/v0/chat_session/create（预创建 + TTL）
│                        # GET  /api/v0/chat_session/fetch_page（游标分页）
└── history-messages.ts  # GET  /api/v0/chat/history_messages（加载历史消息）
```

## 核心数据流

```
ChatIndexView / ChatDetailView
  → useChatCompletion (useMutation)
    → createChatCompletionRequest → POST /chat/completion
    → processChatCompletionStream
        → createChatCompletionParser (stream/parser.ts)
            → createPatchStreamParser (chat-core)
                → applyPathPatch → immer 更新 ChatState
        → consumePatchStream (chat-core)
  → queryClient.setQueryData(chatKeys.session(...))
    → ChatMessageList 重渲染
```

## 关键类型（types.ts）

- **ChatSession**：会话元数据（id、title、title_type、current_message_id 等）
- **ChatState**：`{ chat_session, chat_messages }` — TanStack Query 缓存的核心单元
- **ChatMessage**：扩展自 `CoreMessage`，增加 `model`、`thinking_enabled`、`search_enabled`、`has_pending_block` 等字段
- **DraftSession**：预创建会话 + `ttl_seconds`，用于首页零延迟发消息
- **ChatCompletionOptions**：发消息参数（chatSessionId、prompt、parentMessageId、thinkingEnabled、searchEnabled）

## 各文件职责速查

| 文件 | 何时需要读 |
|------|-----------|
| `types.ts` | 了解领域类型时必读 |
| `hooks/useChatCompletion.ts` | 发消息/resume 的完整流程，含乐观更新与错误回滚 |
| `hooks/useChatSessionList.ts` | 会话列表查询与缓存更新（`upsertChatSessionListItem` 等工具函数） |
| `hooks/useDraftSession.ts` | 首页预创建会话逻辑，`consume()` 的过期检测与重建 |
| `stream/parser.ts` | SSE 事件如何映射到 `ChatState`（`onReady` 替换乐观 ID、`onUpsertMessage` 插入消息） |
| `stream/stream.ts` | 组装 parser + consumePatchStream 的入口，通常只需看接口 |
| `components/chat-detail-view.tsx` | 自动 resume 逻辑（检测 WIP assistant message → 调用 resumeCompletion） |
| `components/chat-index-view.tsx` | 首页发消息流程：consume draft → 设置缓存 → 发请求 → 跳转 |
| `src/server/session-chat/chat-completion.ts` | 服务端 fan-out 多订阅者架构、内存 snapshot 维护、DB 持久化 |

## Query Key 结构（keys.ts）

```ts
chatKeys.sessions()           // 会话列表（InfiniteQuery）
chatKeys.session(id)          // 单个会话 ChatState
chatKeys.draftSession(scope)  // 预创建会话
```

## 乐观更新与 ready 事件

1. 发消息时立即用负数临时 ID 插入用户消息（乐观更新）
2. SSE `ready` 事件返回真实 `user_message_id` → 替换临时 ID 并重排序
3. SSE `upsert_message` 事件插入/替换 assistant 消息快照
4. 后续 patch 帧增量更新 `chat_messages[i].blocks[j].content`

## Resume 流程

- `ChatDetailView` 在 `sessionQuery.isSuccess` 后检测最后一条 `status === "WIP"` 的 ASSISTANT 消息
- 调用 `useResumeChatCompletion` → `POST /api/v0/chat/resume_stream`
- 服务端从内存 `activeCompletionControllers` 或 DB 快照重建 SSE 流
- 失败时将该消息 status 置为 `FAILED` 并写入 `incomplete_message`
