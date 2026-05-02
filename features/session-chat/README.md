## 创建会话

`/api/v0/chat_session/create`

```
WHEN 进入新页面 THEN 检查是否存在预创建会话，不存在调用 /create 接口预创建会话
WHEN 点击发送按钮 THEN 获取预创建会话，并用于构建本地会话镜像；
WHEN 在新页面切换到详情页又切换回新页面 THEN 不会重新请求预创建会话，因为使用了 tanstack query 缓存
WHEN 在新页面刷新页面 THEN 重新预创建会话，服务端对预创建会话有自动回收机制，不用担心
```

接口响应：

```ts
{
    "code": 0,
    "msg": "",
    "data": {
        "biz_code": 0,
        "biz_msg": "",
        "biz_data": {
            "chat_session": {
                "id": "fcc9c66b-7976-46fd-a562-66a6c1acd014",
                "seq_id": 199711071,
                "agent": "chat",
                "model_type": "default",
                "title": null,
                "title_type": "WIP",
                "version": 0,
                "current_message_id": null,
                "pinned": false,
                "inserted_at": 1777547871.563,
                "updated_at": 1777547871.563
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

- `ttl_seconds`：这个预创建会话的有效期秒数。`259200` 是 3 天，未使用的候选会话在过期后被服务端自动清理。

核心就是 `id`、`title`、`current_message_id`。

## 发起请求

`/chat/completion`

参数：

```ts
{
    "chat_session_id": "6dfa0200-79c4-4376-b554-5d3578553ac3", // 提前存储的 id
    "parent_message_id": null, // 是上一条消息的 id，第一条消息就是 null
    "model_type": "default",
    "prompt": "hi",
    "ref_file_ids": [], // 引用文件 id，上传了文件就直接推到后端拿到 id
    "thinking_enabled": false,
    "search_enabled": false,
    "preempt": false
}
```

## 获取会话详情

`/api/v0/chat/history_messages?chat_session_id=6dfa0200-79c4-4376-b554-5d3578553ac3`

```ts
{
    "code": 0,
    "msg": "",
    "data": {
        "biz_code": 0,
        "biz_msg": "",
        "biz_data": {
            "chat_session": {
                "id": "b4ff8835-13fb-4d20-a562-645c91a4e4b9",
                "title": "用户问候助手回应",
                "title_type": "SYSTEM", // WIP 生成中，SYSTEM 后台生成，USER 用户手动修改过
                "model_type": "default",
                "pinned": false, // 是否置顶
                "updated_at": 1777547873.195,
                "seq_id": 199711071,
                "agent": "chat",
                "version": 2,
                "is_empty": false, // 会话是否还没有有效消息，新建未发送时为 true，首条用户消息创建后为 false
                "current_message_id": 2, // 当前消息链的最后一条消息 ID
                "inserted_at": 1777538141.602
            },
            "chat_messages": [
                {
                    "message_id": 1,
                    "parent_id": null, // 第一条消息的父节点 id 为 null
                    "model": "",
                    "role": "USER",
                    "thinking_enabled": false,
                    "ban_edit": false, // 禁止编辑
                    "ban_regenerate": false, // 禁止重新生成
                    "status": "FINISHED", // // 常见值包括 “FINISHED”（正常完成）、“PENDING”（等待中）、“RUNNING”（生成中）、“FAILED”（失败）、“TRUNCATED”（被截断）。前端根据这个值显示“停止生成”按钮还是显示完整内容。
                    "incomplete_message": null,
                    "accumulated_token_usage": 2,
                    "feedback": null, // / 用户反馈，如 null（无反馈）、‘like’（点赞）或 ‘dislike’（点踩）。
                    "inserted_at": 1777547872.031,
                    "search_enabled": true,
                    "fragments": [
                        {
                            "id": 1,
                            "type": "REQUEST",
                            "content": "hi"
                        }
                    ],
                    "has_pending_fragment": false,
                    "auto_continue": false
                },
                {
                    "message_id": 2,
                    "parent_id": 1,
                    "model": "",
                    "role": "ASSISTANT",
                    "thinking_enabled": false,
                    "ban_edit": false,
                    "ban_regenerate": false,
                    "status": "FINISHED",
                    "incomplete_message": null,
                    "accumulated_token_usage": 69,
                    "feedback": null,
                    "inserted_at": 1777547872.0289998,
                    "search_enabled": true,
                    "fragments": [
                        {
                            "id": 2,
                            "type": "RESPONSE",
                            "content": "你好！👋 很高兴见到你！\n\n有什么我可以帮你的吗？无论是学习、工作、生活中的问题，还是只是想聊聊天，我都很乐意陪你。随时开口吧！😊",
                            "references": [],
                            "stage_id": 1
                        }
                    ],
                    "has_pending_fragment": false,
                    "auto_continue": false
                }
            ],
            "cache_control": "REPLACE",
            "cache_reset_at": 1777548500
        }
    }
}
```

`chat_session` 对象和 /crate 接口返回的 `chat_session` 对象一致，只是多了 isEmpty。

## SSE 消息

```json
event: ready
data: {"request_message_id":1,"response_message_id":2,"model_type":"default"}

event: update_session
data: {"updated_at":1777548191.925}

data: {"v":{"response":{"message_id":2,"parent_id":1,"model":"","role":"ASSISTANT","thinking_enabled":false,"ban_edit":false,"ban_regenerate":false,"status":"WIP","incomplete_message":null,"accumulated_token_usage":0,"feedback":null,"inserted_at":1777548191.924,"search_enabled":false,"fragments":[{"id":2,"type":"RESPONSE","content":"你好","references":[],"stage_id":1}],"conversation_mode":"DEFAULT","has_pending_fragment":false,"auto_continue":false}}}

data: {"p":"response/fragments/-1/content","o":"APPEND","v":"！"}

data: {"v":"👋"}

data: {"v":" "}

data: {"v":"很高兴"}

data: {"v":"见到"}

data: {"v":"你"}

data: {"v":"！"}

data: {"v":"有什么"}

data: {"v":"我可以"}

data: {"v":"帮"}

data: {"v":"你的"}

data: {"v":"吗"}

data: {"v":"？"}

data: {"v":"无论是"}

data: {"v":"聊天"}

data: {"v":"、"}

data: {"v":"解答"}

data: {"v":"问题"}

data: {"v":"，"}

data: {"v":"还是"}

data: {"v":"需要"}

data: {"v":"一些"}

data: {"v":"建议"}

data: {"v":"，"}

data: {"v":"我"}

data: {"v":"都很"}

data: {"v":"乐意"}

data: {"v":"陪伴"}

data: {"v":"你"}

data: {"v":"～"}

data: {"v":" 😊"}

data: {"p":"response","o":"BATCH","v":[{"p":"accumulated_token_usage","v":151},{"p":"quasi_status","v":"FINISHED"}]}

data: {"p":"response/status","o":"SET","v":"FINISHED"}

event: update_session
data: {"updated_at":1777548194.338}

event: title
data: {"content":"hi"}

event: close
data: {"click_behavior":"none","auto_resume":false}
```

**p/o/v**

- `p` 表示 path 要操作的路径
- `o` 表示 operation，表示操作类型，比如 APPEND、SET、BATCH。
- `v` 表示 value，表示新值或增量文本。

**operation 规则**

- 有 p + o + v，表示对已有状态树执行操作，并记录 p
- 只有 v，表示 p: 记录的 p + o: APPEND
- o = PATCH 时，表示批处理操作。v 的值为 p + o + v 的数组。数组中 p 为外层 p 的自己路径
- response 表示当前响应的对象，-1 表示数组的最新的项
