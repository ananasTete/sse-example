# 需求分析

```
WHEN 进入新页面 THEN 检查是否存在 chat_session_id 缓存，不存在调用 /create 接口预先创建会话
WHEN 点击发送按钮 THEN 1. 调用 /chat/completion 触发 SSE 响应 2. 检查是否存在 chat_session_id 缓存，否则调用 /create 接口用于下次会话
```

`/api/v0/chat_session/create`

- 进入新会话时调用，用于预先创建会话，返回会话 ID
- 刷新页面时重新调用
- 每个预先创建会话有回收期，比如超过三天就自动回收。每次请求时创建新的即可，不用考虑复用，不用在前端持久化存储

```ts
{
    "code": 0,
    "msg": "",
    "data": {
        "biz_code": 0,
        "biz_msg": "",
        "biz_data": {
            "chat_session": {
                "id": "20ac217d-e151-4c60-87a8-7b56c60bba6a",
                "seq_id": 199693319,
                "agent": "chat",
                "model_type": "default",
                "title": null,
                "title_type": "WIP",
                "version": 0,
                "current_message_id": null,
                "pinned": false,
                "inserted_at": 1777530119.596,
                "updated_at": 1777530119.596
            },
            "ttl_seconds": 259200
        }
    }
}
```

`/api/v0/chat_session/create` 的响应可以按三层理解：通用接口层、业务层、会话数据层。

字段含义：

- `code`：通用接口状态码。`0` 表示接口层成功。
- `msg`：通用接口提示。成功时通常为空。
- `data`：业务响应容器。

- `biz_code`：业务状态码。`0` 表示创建会话业务成功。
- `biz_msg`：业务提示。成功时通常为空。
- `biz_data`：真正的业务数据。

`chat_session` 内部：

- `id`：会话 ID。后续 `/chat/completion` 可用它作为 `chat_session_id`。
- `seq_id`：服务端递增序号，方便排序、分页、同步或内部追踪。
- `agent`：会话所属 agent 类型。这里是普通聊天 `chat`。
- `model_type`：模型类型标识。`default` 表示默认模型配置。
- `title`：会话标题。刚创建时为空。
- `title_type`：标题状态。`WIP` 表示标题还在等待生成或更新。
- `version`：会话版本号，用于并发更新、同步或兼容控制。
- `current_message_id`：当前会话游标消息 ID。新会话没有消息，所以是 `null`。
- `pinned`：是否置顶。
- `inserted_at`：创建时间戳，单位大概率是秒，带毫秒小数。
- `updated_at`：更新时间戳。

- `ttl_seconds`：这个预创建会话的有效期秒数。`259200` 是 3 天，未使用的候选会话可在过期后清理。

关键判断：`id` 是能绑定 completion 的核心字段；`current_message_id` 会在产生消息后变成最新消息 ID。

核心就是 id、title、current_message_id。
