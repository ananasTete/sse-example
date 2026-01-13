## 核心实现：接收流式输出

### 流式输出数据格式

`data: [内容]\n\n`

`[DONE]`

### 方案

#### 方案一：原生 EventSource API

缺点：

1. 只支持 GET 请求（但现在的 AI 对话通常需要 POST 发送长 Prompt）。
2. 不支持自定义 Header（无法发送 Authorization: Bearer token）。

#### 方案二：fetch API + ReadableStream

得到的 chunk 是 `data: {"text":"这"}\n\n` 这样的结构，需要自己解析出内容。并且在网络波动时，收到的 chunk 可能是半截的，或者粘在一起的，称为数据截断/粘连，自己处理太麻烦了

#### 方案三：fetch + ReadableStream + eventsource-parser （最终）

使用 eventsource-parser 库来解析

核心实现见 `useCoreGeneration.ts`

#### 方案四：@microsoft/fetch-event-source

1. 允许 post 请求，支持自定义 header
2. 内置了指数退避算法（断网了会自动重试，重试间隔越来越长）。
3. 提供了 onopen, onmessage, onclose, onerror 完整的钩子。
4. 内部自动处理了数据被截断或粘连的情况。

这个库是为 “保活（Keep-Alive）” 设计的（比如实时监控大盘、服务器推送通知），它想方设法让连接不断开。

它的设计假设是：流永远不应该结束。所以它没有标准的 "onFinish" 概念，只有 onclose（通常被认为是意外断开需要重连）。你需要手动抛出错误来强制它停止重试。

使用场景不匹配

## 非核心实现

1. stop 停止输出（使用 AbortController 实现）
2. datapaser 自定义 `data: [内容]\n\n` 中内容格式的解析
3. 自定义 header
4. loading 状态
5. 生命周期 hook：onFinish / onError / onResponse / onStartStream
