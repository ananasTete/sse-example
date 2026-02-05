

## 核心实现

和 `useGeneration` 一样，都是 fetch + ReadaleStream + eventsource-parser 实现，没什么不一样。

所以 `useChat` 的核心实现是:

1. 文本、图片、工具调用等输出内容下的 SSE 数据协议的制定和解析，对于协议规范见 Protocol.md 文档
2. hook 中维护一个 Message 数据结构
3. 通过 SSE 推新数据 -> 更新 Message 对应信息（通过id） -> 更新 UI 

## 非核心实现

1. 重新生成（支持重新生成最后一条消息和指定消息）, 注意：每一次请求时都是发送所有历史记录
2. input / handleInputChange / handleSubmit 提供受控模式支持，可以绑定到UI的表单，会在提交后清空数据；同时也支持非受控使用
3. 维护 messages 消息列表
4. 中断请求
5. status: "submitted" | "streaming" | "ready" | "error"
6. 生命周期 hook: onFinish / onError /onData
