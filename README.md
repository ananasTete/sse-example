# 基础

## SSE 技术：

1. 服务端返回的 Content-Type 必须是 text/event-stream，并且数据格式有严格要求，必须以 data: 开头，以 \n\n 结尾。
2. 最后的消息是 `"[done]\n\n"`，表示结束。

参考：

```
data: {"text":"这"}

data: {"text":"是"}

data: {"text":"一"}

data: {"text":"段"}

data: {"text":"测试"}

data: {"text":"文"}

data: {"text":"本"}

data: [done]
```

`{text: xx}` 是自定义的格式

## EventSource API

缺点：

1. 只支持 GET 请求（但现在的 AI 对话通常需要 POST 发送长 Prompt）。
2. 不支持自定义 Header（无法发送 Authorization: Bearer token）。

## fetch API + ReadableStream

缺点：需要自己开发解析器，处理数据截断/粘连的情况。

## fetch API + ReadableStream + eventsource-parser

使用 eventsource-parser 解析器，处理数据截断/粘连的情况。

## @microsoft/fetch-event-source

1. 允许 post 请求，支持自定义 header
2. 内置了指数退避算法（断网了会自动重试，重试间隔越来越长）。
3. 提供了 onopen, onmessage, onclose, onerror 完整的钩子。
4. 内部自动处理了数据被截断或粘连的情况。

这个库是为 “保活（Keep-Alive）” 设计的（比如监控大盘、消息通知），它想方设法让连接不断开。

它的设计假设是：流永远不应该结束。所以它没有标准的 "onFinish" 概念，只有 onclose（通常被认为是意外断开需要重连）。你需要手动抛出错误来强制它停止重试。
