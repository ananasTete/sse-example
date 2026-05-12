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
                    "blocks": [
                        {
                            "id": 1,
                            "type": "request",
                            "content": "hi"
                        }
                    ],
                    "has_pending_block": false,
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
                    "blocks": [
                        {
                            "id": 2,
                            "type": "response",
                            "content": "你好！👋 很高兴见到你！\n\n有什么我可以帮你的吗？无论是学习、工作、生活中的问题，还是只是想聊聊天，我都很乐意陪你。随时开口吧！😊",
                            "references": [],
                            "stage_id": 1
                        }
                    ],
                    "has_pending_block": false,
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
data: {"response_message_id":2}

event: update_session
data: {"updated_at":1777548191.925}

data: {"v":{"response":{"message_id":2,"parent_id":1,"model":"","role":"ASSISTANT","thinking_enabled":false,"ban_edit":false,"ban_regenerate":false,"status":"WIP","incomplete_message":null,"accumulated_token_usage":0,"feedback":null,"inserted_at":1777548191.924,"search_enabled":false,"blocks":[{"id":2,"type":"response","content":"你好","references":[],"stage_id":1}],"conversation_mode":"DEFAULT","has_pending_block":false,"auto_continue":false}}}

data: {"p":"response/blocks/-1/content","o":"APPEND","v":"！"}

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

### web_search

```json
event: ready
data: {"response_message_id":2}

event: update_session
data: {"updated_at":1777732952.603}

data: {"v":{"response":{"message_id":2,"parent_id":1,"model":"","role":"ASSISTANT","thinking_enabled":false,"ban_edit":false,"ban_regenerate":false,"status":"WIP","incomplete_message":null,"accumulated_token_usage":0,"feedback":null,"inserted_at":1777732952.602,"search_enabled":true,"blocks":[{"id":1,"type":"search","status":"WIP","content":null,"queries":[{"query":"deepseek 最新的模型是什么"}],"results":[]}],"conversation_mode":"SEARCH","has_pending_block":false,"auto_continue":false}}}

data: {"p":"response/blocks/-1/results","v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]},{"url":"https://zh.wikipedia.org/wiki/DeepSeek-V3","title":"DeepSeek-V3 - 維基百科，自由的百科全書","snippet":"DeepSeek-V3是深度求索於2024年12月16日發布的人工智慧大型語言模型，專門適用於數學、編碼和中文等任務，效能對標GPT-4o等競爭產品。","cite_index":5,"site_name":"zh.wikipedia.org","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]},{"url":"https://zh.wikipedia.org/wiki/DeepSeek-V3","title":"DeepSeek-V3 - 維基百科，自由的百科全書","snippet":"DeepSeek-V3是深度求索於2024年12月16日發布的人工智慧大型語言模型，專門適用於數學、編碼和中文等任務，效能對標GPT-4o等競爭產品。","cite_index":5,"site_name":"zh.wikipedia.org","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news260424","title":"DeepSeek-V4 预览版：迈入百万上下文普惠时代","snippet":"# DeepSeek-V4 预览版：迈入百万上下文普惠时代. 今天，我们全新系列模型 DeepSeek-V4 的预览版本正式上线并同步开源。. DeepSeek-V4 拥有百万字超长上下文，在 Agent 能力、世界知识和推理性能上均实现国内与开源领域的领先。模型按大小分为两个版本：. 即日起登录官网 chat.deepseek.com 或官方App，即可与最新的 DeepSeek-V4 对话，探索 1M 超长上下文记忆的全新体验。API 服务已同步更新，通过修改 model\\_name 为 deepseek-v4-pro 或 deepseek-v4-flash 即可调用。. ## DeepSeek-V4-Pro：性能比肩顶级闭源模型​. **Agent 能力大幅提高：**相比前代模型，DeepSeek-V4-Pro 的 Agent 能力显著增强。在 Agentic Coding 评测中，V4-Pro 已达到当前开源模型最佳水平，并在其他 Agent 相关评测中同样表现优异。目前 DeepSeek-V4 已成为公司内部员工使用的 Agentic Coding 模型，据评测反馈使用体验优于 Sonnet 4.5，交付质量接近 Opus 4.6 非思考模式，但仍与 Opus 4.6 思考模式存在一定差距。. **丰富的世界知识：**DeepSeek-V4-Pro 在世界知识测评中，大幅领先其他开源模型，仅稍逊于顶尖闭源模型 Gemini-Pro-3.1。. **世界顶级推理性能：**在数学、STEM、竞赛型代码的测评中，DeepSeek-V4-Pro 超越当前所有已公开评测的开源模型，取得了比肩世界顶\u0000级闭源模型的优异成绩。. ## DeepSeek-V4-Flash：更快捷高效的经济之选​. 相比 DeepSeek-V4-Pro，DeepSeek-V4-Flash 在世界知识储备方面稍逊一筹，但展现出了接近的推理能力。而由于模型参数和激活更小，相较之下 V4-Flash 能够提供更加快捷、经济的 API 服务。. 在 Agent 测评中，DeepSeek-V4-Flash 在简单任务上与 DeepSeek-V4-Pro 旗鼓相当，但在高难度任务上仍有差距。. ## 结构创新和超高上下文效率​. DeepSeek-V4 开创了一种全新的注意力机制，在 token 维度进行压缩，结合 DSA 稀疏注意力（DeepSeek Sparse Attention），实现了全球领先的长上下文能力，并且相比于传统方法大幅降低了对计算和显存的需求。从现在开始，1M（一百万）上下文将是 DeepSeek 所有官方服务的标配。. ## Agent 能力专项优化​. DeepSeek-V4 针对 Claude Code 、OpenClaw、OpenCode、CodeBuddy 等主流的 Agent 产品进行了适配和优化，在代码任务、文档生成任务等方面表现均有提升。下图为 V4-Pro 在某 Agent 框架下生成的 PPT 内页示例：. ## API 访问​. 目前，DeepSeek API 已同步上线 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 deepseek-v4-pro 或 deepseek-v4-flash。. V4-Pro 与 V4-Flash 最大上下文长度为 1M，均同时支持非思考模式与思考模式，其中思考模式支持 reasoning\\_effort 参数设置思考强度（high/max）。对于复杂的 Agent 场景建议使用思考模式，并设置强度为 max。模型调用与参数调整方法请参考 API 文档。. 请大家注意：旧有的 API 接口的两个模型名 deepseek-chat 与deepseek-reasoner 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向deepseek-v4-flash 的非思考模式与思考模式。. ## 开源权重和本地部署​. 感谢每一位用户的信任与支持，大家的肯定、建议和期许，是我们不竭探索、持续进步的动力，也让我们始终坚守初心，专注于不懈的创新。. 我们将始终秉持长期主义的原则理念，在尝试与思考中踏实前行，努力向实现 AGI 的目标不断靠近。.","cite_index":6,"site_name":"api-docs.deepseek.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]},{"url":"https://zh.wikipedia.org/wiki/DeepSeek-V3","title":"DeepSeek-V3 - 維基百科，自由的百科全書","snippet":"DeepSeek-V3是深度求索於2024年12月16日發布的人工智慧大型語言模型，專門適用於數學、編碼和中文等任務，效能對標GPT-4o等競爭產品。","cite_index":5,"site_name":"zh.wikipedia.org","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news260424","title":"DeepSeek-V4 预览版：迈入百万上下文普惠时代","snippet":"# DeepSeek-V4 预览版：迈入百万上下文普惠时代. 今天，我们全新系列模型 DeepSeek-V4 的预览版本正式上线并同步开源。. DeepSeek-V4 拥有百万字超长上下文，在 Agent 能力、世界知识和推理性能上均实现国内与开源领域的领先。模型按大小分为两个版本：. 即日起登录官网 chat.deepseek.com 或官方App，即可与最新的 DeepSeek-V4 对话，探索 1M 超长上下文记忆的全新体验。API 服务已同步更新，通过修改 model\\_name 为 deepseek-v4-pro 或 deepseek-v4-flash 即可调用。. ## DeepSeek-V4-Pro：性能比肩顶级闭源模型​. **Agent 能力大幅提高：**相比前代模型，DeepSeek-V4-Pro 的 Agent 能力显著增强。在 Agentic Coding 评测中，V4-Pro 已达到当前开源模型最佳水平，并在其他 Agent 相关评测中同样表现优异。目前 DeepSeek-V4 已成为公司内部员工使用的 Agentic Coding 模型，据评测反馈使用体验优于 Sonnet 4.5，交付质量接近 Opus 4.6 非思考模式，但仍与 Opus 4.6 思考模式存在一定差距。. **丰富的世界知识：**DeepSeek-V4-Pro 在世界知识测评中，大幅领先其他开源模型，仅稍逊于顶尖闭源模型 Gemini-Pro-3.1。. **世界顶级推理性能：**在数学、STEM、竞赛型代码的测评中，DeepSeek-V4-Pro 超越当前所有已公开评测的开源模型，取得了比肩世界顶\u0000级闭源模型的优异成绩。. ## DeepSeek-V4-Flash：更快捷高效的经济之选​. 相比 DeepSeek-V4-Pro，DeepSeek-V4-Flash 在世界知识储备方面稍逊一筹，但展现出了接近的推理能力。而由于模型参数和激活更小，相较之下 V4-Flash 能够提供更加快捷、经济的 API 服务。. 在 Agent 测评中，DeepSeek-V4-Flash 在简单任务上与 DeepSeek-V4-Pro 旗鼓相当，但在高难度任务上仍有差距。. ## 结构创新和超高上下文效率​. DeepSeek-V4 开创了一种全新的注意力机制，在 token 维度进行压缩，结合 DSA 稀疏注意力（DeepSeek Sparse Attention），实现了全球领先的长上下文能力，并且相比于传统方法大幅降低了对计算和显存的需求。从现在开始，1M（一百万）上下文将是 DeepSeek 所有官方服务的标配。. ## Agent 能力专项优化​. DeepSeek-V4 针对 Claude Code 、OpenClaw、OpenCode、CodeBuddy 等主流的 Agent 产品进行了适配和优化，在代码任务、文档生成任务等方面表现均有提升。下图为 V4-Pro 在某 Agent 框架下生成的 PPT 内页示例：. ## API 访问​. 目前，DeepSeek API 已同步上线 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 deepseek-v4-pro 或 deepseek-v4-flash。. V4-Pro 与 V4-Flash 最大上下文长度为 1M，均同时支持非思考模式与思考模式，其中思考模式支持 reasoning\\_effort 参数设置思考强度（high/max）。对于复杂的 Agent 场景建议使用思考模式，并设置强度为 max。模型调用与参数调整方法请参考 API 文档。. 请大家注意：旧有的 API 接口的两个模型名 deepseek-chat 与deepseek-reasoner 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向deepseek-v4-flash 的非思考模式与思考模式。. ## 开源权重和本地部署​. 感谢每一位用户的信任与支持，大家的肯定、建议和期许，是我们不竭探索、持续进步的动力，也让我们始终坚守初心，专注于不懈的创新。. 我们将始终秉持长期主义的原则理念，在尝试与思考中踏实前行，努力向实现 AGI 的目标不断靠近。.","cite_index":6,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/updates","title":"更新日志 - DeepSeek API Docs","snippet":"### DeepSeek-V4​. DeepSeek API 已支持 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 `deepseek-v4-pro` 或 `deepseek-v4-flash`。. 旧有的 API 接口的两个模型名 `deepseek-chat` 与 `deepseek-reasoner` 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向 `deepseek-v4-flash` 的非思考模式与思考模式。. ### DeepSeek-V3.2​. `deepseek-chat` 和 `deepseek-reasoner` 都已升级为 DeepSeek-V3.2. ### DeepSeek-V3.2-Speciale​. 我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"`. ### DeepSeek-V3.2-Exp​. `deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.2-Exp。. ### DeepSeek-V3.1-Terminus​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1-Terminus。**`deepseek-chat` 对应 DeepSeek-V3.1-Terminus 的**非思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1-Terminus 的**思考模式**。. ### DeepSeek-V3.1​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1。**`deepseek-chat` 对应 DeepSeek-V3.1 的**非\u0000\u0000思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1 的**思考模式**。. ### deepseek-reasoner​. **`deepseek-reasoner` 模型升级为 DeepSeek-R1-0528：**. ### deepseek-chat​. **`deepseek-chat` 模型升级为 DeepSeek-V3-0324：**. ### deepseek-reasoner​. ### deepseek-chat​. ### deepseek-chat​. deepseek-chat 模型升级为 DeepSeek-V2.5-1210，模型各项能力提升，相关基准测试：. ### `deepseek-coder` & `deepseek-chat` 升级为 DeepSeek V2.5 模型​. DeepSeek V2 Chat 和 DeepSeek Coder V2 两个模型已经合并升级，升级后的新模型为 DeepSeek V2.5。. 为向前兼容，API 用户通过 `deepseek-coder` 或 `deepseek-chat` 均可以访问新的模型。. 更新详情请跳转文档 API 上线硬盘缓存 2024/08/02. ### deepseek-coder​. deepseek-coder 模型升级为 DeepSeek-Coder-V2-0724。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0628，模型推理能力提升，相关基准测试：. ### deepseek-coder​. `deepseek-coder` 模型升级为 DeepSeek-Coder-V2-0614，代码能力显著提升，在代码生成、代码理解、代码修复和代码补全上达到了 GPT-4-Turbo-0409 的水平，并拥有卓越的数学和推理能力，其通用能力与 DeepSeek-V2-0517 持平。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0517，模型在指令跟随方面的性能得到了显著提升，IFEval Benchmark Prompt-Level 准确率从 63.9% 跃升至 77.6%。此外，我们对API端的“system”区域指令\u0000跟随能力进行了优化，显著增强了沉浸式翻译、RAG 等任务的用户体验。.","cite_index":7,"site_name":"api-docs.deepseek.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]},{"url":"https://zh.wikipedia.org/wiki/DeepSeek-V3","title":"DeepSeek-V3 - 維基百科，自由的百科全書","snippet":"DeepSeek-V3是深度求索於2024年12月16日發布的人工智慧大型語言模型，專門適用於數學、編碼和中文等任務，效能對標GPT-4o等競爭產品。","cite_index":5,"site_name":"zh.wikipedia.org","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news260424","title":"DeepSeek-V4 预览版：迈入百万上下文普惠时代","snippet":"# DeepSeek-V4 预览版：迈入百万上下文普惠时代. 今天，我们全新系列模型 DeepSeek-V4 的预览版本正式上线并同步开源。. DeepSeek-V4 拥有百万字超长上下文，在 Agent 能力、世界知识和推理性能上均实现国内与开源领域的领先。模型按大小分为两个版本：. 即日起登录官网 chat.deepseek.com 或官方App，即可与最新的 DeepSeek-V4 对话，探索 1M 超长上下文记忆的全新体验。API 服务已同步更新，通过修改 model\\_name 为 deepseek-v4-pro 或 deepseek-v4-flash 即可调用。. ## DeepSeek-V4-Pro：性能比肩顶级闭源模型​. **Agent 能力大幅提高：**相比前代模型，DeepSeek-V4-Pro 的 Agent 能力显著增强。在 Agentic Coding 评测中，V4-Pro 已达到当前开源模型最佳水平，并在其他 Agent 相关评测中同样表现优异。目前 DeepSeek-V4 已成为公司内部员工使用的 Agentic Coding 模型，据评测反馈使用体验优于 Sonnet 4.5，交付质量接近 Opus 4.6 非思考模式，但仍与 Opus 4.6 思考模式存在一定差距。. **丰富的世界知识：**DeepSeek-V4-Pro 在世界知识测评中，大幅领先其他开源模型，仅稍逊于顶尖闭源模型 Gemini-Pro-3.1。. **世界顶级推理性能：**在数学、STEM、竞赛型代码的测评中，DeepSeek-V4-Pro 超越当前所有已公开评测的开源模型，取得了比肩世界顶\u0000级闭源模型的优异成绩。. ## DeepSeek-V4-Flash：更快捷高效的经济之选​. 相比 DeepSeek-V4-Pro，DeepSeek-V4-Flash 在世界知识储备方面稍逊一筹，但展现出了接近的推理能力。而由于模型参数和激活更小，相较之下 V4-Flash 能够提供更加快捷、经济的 API 服务。. 在 Agent 测评中，DeepSeek-V4-Flash 在简单任务上与 DeepSeek-V4-Pro 旗鼓相当，但在高难度任务上仍有差距。. ## 结构创新和超高上下文效率​. DeepSeek-V4 开创了一种全新的注意力机制，在 token 维度进行压缩，结合 DSA 稀疏注意力（DeepSeek Sparse Attention），实现了全球领先的长上下文能力，并且相比于传统方法大幅降低了对计算和显存的需求。从现在开始，1M（一百万）上下文将是 DeepSeek 所有官方服务的标配。. ## Agent 能力专项优化​. DeepSeek-V4 针对 Claude Code 、OpenClaw、OpenCode、CodeBuddy 等主流的 Agent 产品进行了适配和优化，在代码任务、文档生成任务等方面表现均有提升。下图为 V4-Pro 在某 Agent 框架下生成的 PPT 内页示例：. ## API 访问​. 目前，DeepSeek API 已同步上线 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 deepseek-v4-pro 或 deepseek-v4-flash。. V4-Pro 与 V4-Flash 最大上下文长度为 1M，均同时支持非思考模式与思考模式，其中思考模式支持 reasoning\\_effort 参数设置思考强度（high/max）。对于复杂的 Agent 场景建议使用思考模式，并设置强度为 max。模型调用与参数调整方法请参考 API 文档。. 请大家注意：旧有的 API 接口的两个模型名 deepseek-chat 与deepseek-reasoner 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向deepseek-v4-flash 的非思考模式与思考模式。. ## 开源权重和本地部署​. 感谢每一位用户的信任与支持，大家的肯定、建议和期许，是我们不竭探索、持续进步的动力，也让我们始终坚守初心，专注于不懈的创新。. 我们将始终秉持长期主义的原则理念，在尝试与思考中踏实前行，努力向实现 AGI 的目标不断靠近。.","cite_index":6,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/updates","title":"更新日志 - DeepSeek API Docs","snippet":"### DeepSeek-V4​. DeepSeek API 已支持 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 `deepseek-v4-pro` 或 `deepseek-v4-flash`。. 旧有的 API 接口的两个模型名 `deepseek-chat` 与 `deepseek-reasoner` 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向 `deepseek-v4-flash` 的非思考模式与思考模式。. ### DeepSeek-V3.2​. `deepseek-chat` 和 `deepseek-reasoner` 都已升级为 DeepSeek-V3.2. ### DeepSeek-V3.2-Speciale​. 我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"`. ### DeepSeek-V3.2-Exp​. `deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.2-Exp。. ### DeepSeek-V3.1-Terminus​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1-Terminus。**`deepseek-chat` 对应 DeepSeek-V3.1-Terminus 的**非思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1-Terminus 的**思考模式**。. ### DeepSeek-V3.1​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1。**`deepseek-chat` 对应 DeepSeek-V3.1 的**非\u0000\u0000思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1 的**思考模式**。. ### deepseek-reasoner​. **`deepseek-reasoner` 模型升级为 DeepSeek-R1-0528：**. ### deepseek-chat​. **`deepseek-chat` 模型升级为 DeepSeek-V3-0324：**. ### deepseek-reasoner​. ### deepseek-chat​. ### deepseek-chat​. deepseek-chat 模型升级为 DeepSeek-V2.5-1210，模型各项能力提升，相关基准测试：. ### `deepseek-coder` & `deepseek-chat` 升级为 DeepSeek V2.5 模型​. DeepSeek V2 Chat 和 DeepSeek Coder V2 两个模型已经合并升级，升级后的新模型为 DeepSeek V2.5。. 为向前兼容，API 用户通过 `deepseek-coder` 或 `deepseek-chat` 均可以访问新的模型。. 更新详情请跳转文档 API 上线硬盘缓存 2024/08/02. ### deepseek-coder​. deepseek-coder 模型升级为 DeepSeek-Coder-V2-0724。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0628，模型推理能力提升，相关基准测试：. ### deepseek-coder​. `deepseek-coder` 模型升级为 DeepSeek-Coder-V2-0614，代码能力显著提升，在代码生成、代码理解、代码修复和代码补全上达到了 GPT-4-Turbo-0409 的水平，并拥有卓越的数学和推理能力，其通用能力与 DeepSeek-V2-0517 持平。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0517，模型在指令跟随方面的性能得到了显著提升，IFEval Benchmark Prompt-Level 准确率从 63.9% 跃升至 77.6%。此外，我们对API端的“system”区域指令\u0000跟随能力进行了优化，显著增强了沉浸式翻译、RAG 等任务的用户体验。.","cite_index":7,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://zhuanlan.zhihu.com/p/1981363419455197476","title":"DeepSeek V3到V3.2的进化之路，一文看全 - 知乎专栏","snippet":"这里值得注意的是，DeepSeek V3 是基础模型，而DeepSeek R1 是专用的推理模型。 ... 所以，总的来说，DeepSeek V3.2 比最近的其他一些模型更接近原始的","cite_index":8,"site_name":"zhuanlan.zhihu.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]},{"url":"https://zh.wikipedia.org/wiki/DeepSeek-V3","title":"DeepSeek-V3 - 維基百科，自由的百科全書","snippet":"DeepSeek-V3是深度求索於2024年12月16日發布的人工智慧大型語言模型，專門適用於數學、編碼和中文等任務，效能對標GPT-4o等競爭產品。","cite_index":5,"site_name":"zh.wikipedia.org","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news260424","title":"DeepSeek-V4 预览版：迈入百万上下文普惠时代","snippet":"# DeepSeek-V4 预览版：迈入百万上下文普惠时代. 今天，我们全新系列模型 DeepSeek-V4 的预览版本正式上线并同步开源。. DeepSeek-V4 拥有百万字超长上下文，在 Agent 能力、世界知识和推理性能上均实现国内与开源领域的领先。模型按大小分为两个版本：. 即日起登录官网 chat.deepseek.com 或官方App，即可与最新的 DeepSeek-V4 对话，探索 1M 超长上下文记忆的全新体验。API 服务已同步更新，通过修改 model\\_name 为 deepseek-v4-pro 或 deepseek-v4-flash 即可调用。. ## DeepSeek-V4-Pro：性能比肩顶级闭源模型​. **Agent 能力大幅提高：**相比前代模型，DeepSeek-V4-Pro 的 Agent 能力显著增强。在 Agentic Coding 评测中，V4-Pro 已达到当前开源模型最佳水平，并在其他 Agent 相关评测中同样表现优异。目前 DeepSeek-V4 已成为公司内部员工使用的 Agentic Coding 模型，据评测反馈使用体验优于 Sonnet 4.5，交付质量接近 Opus 4.6 非思考模式，但仍与 Opus 4.6 思考模式存在一定差距。. **丰富的世界知识：**DeepSeek-V4-Pro 在世界知识测评中，大幅领先其他开源模型，仅稍逊于顶尖闭源模型 Gemini-Pro-3.1。. **世界顶级推理性能：**在数学、STEM、竞赛型代码的测评中，DeepSeek-V4-Pro 超越当前所有已公开评测的开源模型，取得了比肩世界顶\u0000级闭源模型的优异成绩。. ## DeepSeek-V4-Flash：更快捷高效的经济之选​. 相比 DeepSeek-V4-Pro，DeepSeek-V4-Flash 在世界知识储备方面稍逊一筹，但展现出了接近的推理能力。而由于模型参数和激活更小，相较之下 V4-Flash 能够提供更加快捷、经济的 API 服务。. 在 Agent 测评中，DeepSeek-V4-Flash 在简单任务上与 DeepSeek-V4-Pro 旗鼓相当，但在高难度任务上仍有差距。. ## 结构创新和超高上下文效率​. DeepSeek-V4 开创了一种全新的注意力机制，在 token 维度进行压缩，结合 DSA 稀疏注意力（DeepSeek Sparse Attention），实现了全球领先的长上下文能力，并且相比于传统方法大幅降低了对计算和显存的需求。从现在开始，1M（一百万）上下文将是 DeepSeek 所有官方服务的标配。. ## Agent 能力专项优化​. DeepSeek-V4 针对 Claude Code 、OpenClaw、OpenCode、CodeBuddy 等主流的 Agent 产品进行了适配和优化，在代码任务、文档生成任务等方面表现均有提升。下图为 V4-Pro 在某 Agent 框架下生成的 PPT 内页示例：. ## API 访问​. 目前，DeepSeek API 已同步上线 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 deepseek-v4-pro 或 deepseek-v4-flash。. V4-Pro 与 V4-Flash 最大上下文长度为 1M，均同时支持非思考模式与思考模式，其中思考模式支持 reasoning\\_effort 参数设置思考强度（high/max）。对于复杂的 Agent 场景建议使用思考模式，并设置强度为 max。模型调用与参数调整方法请参考 API 文档。. 请大家注意：旧有的 API 接口的两个模型名 deepseek-chat 与deepseek-reasoner 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向deepseek-v4-flash 的非思考模式与思考模式。. ## 开源权重和本地部署​. 感谢每一位用户的信任与支持，大家的肯定、建议和期许，是我们不竭探索、持续进步的动力，也让我们始终坚守初心，专注于不懈的创新。. 我们将始终秉持长期主义的原则理念，在尝试与思考中踏实前行，努力向实现 AGI 的目标不断靠近。.","cite_index":6,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/updates","title":"更新日志 - DeepSeek API Docs","snippet":"### DeepSeek-V4​. DeepSeek API 已支持 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 `deepseek-v4-pro` 或 `deepseek-v4-flash`。. 旧有的 API 接口的两个模型名 `deepseek-chat` 与 `deepseek-reasoner` 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向 `deepseek-v4-flash` 的非思考模式与思考模式。. ### DeepSeek-V3.2​. `deepseek-chat` 和 `deepseek-reasoner` 都已升级为 DeepSeek-V3.2. ### DeepSeek-V3.2-Speciale​. 我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"`. ### DeepSeek-V3.2-Exp​. `deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.2-Exp。. ### DeepSeek-V3.1-Terminus​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1-Terminus。**`deepseek-chat` 对应 DeepSeek-V3.1-Terminus 的**非思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1-Terminus 的**思考模式**。. ### DeepSeek-V3.1​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1。**`deepseek-chat` 对应 DeepSeek-V3.1 的**非\u0000\u0000思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1 的**思考模式**。. ### deepseek-reasoner​. **`deepseek-reasoner` 模型升级为 DeepSeek-R1-0528：**. ### deepseek-chat​. **`deepseek-chat` 模型升级为 DeepSeek-V3-0324：**. ### deepseek-reasoner​. ### deepseek-chat​. ### deepseek-chat​. deepseek-chat 模型升级为 DeepSeek-V2.5-1210，模型各项能力提升，相关基准测试：. ### `deepseek-coder` & `deepseek-chat` 升级为 DeepSeek V2.5 模型​. DeepSeek V2 Chat 和 DeepSeek Coder V2 两个模型已经合并升级，升级后的新模型为 DeepSeek V2.5。. 为向前兼容，API 用户通过 `deepseek-coder` 或 `deepseek-chat` 均可以访问新的模型。. 更新详情请跳转文档 API 上线硬盘缓存 2024/08/02. ### deepseek-coder​. deepseek-coder 模型升级为 DeepSeek-Coder-V2-0724。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0628，模型推理能力提升，相关基准测试：. ### deepseek-coder​. `deepseek-coder` 模型升级为 DeepSeek-Coder-V2-0614，代码能力显著提升，在代码生成、代码理解、代码修复和代码补全上达到了 GPT-4-Turbo-0409 的水平，并拥有卓越的数学和推理能力，其通用能力与 DeepSeek-V2-0517 持平。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0517，模型在指令跟随方面的性能得到了显著提升，IFEval Benchmark Prompt-Level 准确率从 63.9% 跃升至 77.6%。此外，我们对API端的“system”区域指令\u0000跟随能力进行了优化，显著增强了沉浸式翻译、RAG 等任务的用户体验。.","cite_index":7,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://zhuanlan.zhihu.com/p/1981363419455197476","title":"DeepSeek V3到V3.2的进化之路，一文看全 - 知乎专栏","snippet":"这里值得注意的是，DeepSeek V3 是基础模型，而DeepSeek R1 是专用的推理模型。 ... 所以，总的来说，DeepSeek V3.2 比最近的其他一些模型更接近原始的","cite_index":8,"site_name":"zhuanlan.zhihu.com","query_indexes":[0]},{"url":"https://www.deepseek.com/","title":"DeepSeek | 深度求索","snippet":"深度求索（DeepSeek），成立于2023年，专注于研究世界领先的通用人工智能底层模型与技术，挑战人工智能前沿性难题。基于自研训练框架、自建智算集群和万卡算力等资源，","cite_index":9,"site_name":"deepseek.com","query_indexes":[0]}]}

data: {"v":[{"url":"https://wallstreetcn.com/articles/3765514","title":"DeepSeek新模型来了？","snippet":"# DeepSeek新模型来了？. 2月11日，部分用户打开DeepSeek App后收到更新版本的提示。APP更新后（1.7.4），用户可体验到DeepSeek最新模型。本次升级后，模型上下文长度将从128K扩展至1M，接近提升10倍；知识库更新至2025年5月，多项核心能力获得实质性提升。. 作者实测发现，DeepSeek在问答中称，当前的版本很可能也不是V4，**极有可能是V3系列的最终进化形态，或是V4正式亮相前的终极灰度版。**. 野村证券于2月10日发布报告称，**预计2026年2月中旬推出的DeepSeek V4模型，不会重现去年V3发布时引发的全球AI算力需求恐慌。**该行认为，**V4的核心价值在于通过底层架构创新推动AI应用商业化落地，而非颠覆现有AI价值链。**. 据测评，**新版本在复杂任务处理能力上已对齐Gemini 3 Pro及K2.5等主流闭源模型。**野村进一步指出，V4预计将引入mHC与Engram两项创新技术，从算法与工程层面突破算力芯片与内存瓶颈。内部初步测试显示，V4在编程任务中的表现已超越Anthropic Claude及OpenAI GPT系列同代模型。. ## 创新架构针对硬件瓶颈优化. 野村证券报告指出，算力芯片性能与HBM内存瓶颈，始终是国产大模型产业绕不开的硬约束。**即将发布的DeepSeek V4所引入的mHC（超连接与流形约束超连接）与Engram架构，正是从训练与推理两个维度，针对上述短板进行系统级优化。**. 简单说，它让神经网络层之间的“对话”更丰富、更灵活，同时通过严苛的数学“护栏”防止信息被放大或破坏。**实验证明，采用mHC的模型在数学推理等任务上表现更优。**. 一个“条件记忆”模块。它的设计理念是将“记忆”与“计算”解耦。. 模型中的静态知识（如实体、固定表达）被专门存储在一个稀疏的内存表中，这个表可以放在廉价的DRAM里。当需要推理时，再去快速查找。**这释放了昂贵的GPU内存（HBM），让其专注于动态计算。**. mHC技术通过改善训练稳定性和收敛效率，在一定程度对冲国产芯片在互联带宽与计算密度上的代际差距；而Engram架构则致力于重构内存调度机制，在HBM供应受限的背景下，以更高效的存取策略突破显存容量与带宽制约。野村认为，**这两项创新共同构成一套面向国产硬件生态的适配方案，具有明确的工程落地价值。**. 报告进一步指出，**V4发布带来的最直接商业影响，是训练与推理成本的实质性下降**。成本端的优化将有效激发下游应用需求，进而催生新一轮AI基础设施建设周期。在此过程中，**中国AI硬件厂商有望受益于需求放量与投资前置带来的双重拉动。**. ## 市场格局从\"一家独大\"转向\"群雄割据\". 野村报告回顾了DeepSeek-V3/R1发布一年后的市场格局变化。在2024年底，DeepSeek的两个模型曾占据OpenRouter上开源模型Token使用量的一半以上。. 但到2025年下半年，随着更多玩家加入，其市场份额已显著下降。市场从\"一家独大\"走向了\"群雄割据\"。**V4面临的竞争环境远比一年前复杂。DeepSeek的\"算力管理效率\"叠加\"性能提升\"加速了中国大语言模型与应用发展，也改变了全球竞争格局，推动开源模型更受关注。**. ## 软件公司迎来价值提升机遇. 在应用侧，更强大、更高效的V4将催生更强大的AI智能体。报告观察到，像阿里通义千问App等已经能够以更自动化的方式执行多步骤任务，AI智能体正从\"对话工具\"转型为能处理复杂任务的\"AI助手\"。. 这些能执行多任务的智能体需要更频繁地与底层大模型交互，将消耗更多Token，进而推高算力需求。**因此模型效能的提升不仅不会\"杀死软件\"，反而为领先的软件公司创造了价值。**野村强调，需要关注那些能率先利用新一代大模型能力打造出颠覆性AI原生应用或智能体的软件公司。它们的增长天花板可能因模型能力的飞跃而被再次推高。. ## DeepSeek识图模式是个新模型？一手实测在此. ## DeepSeek不惜代价保住它！V4关键特性被挖出来了. ## 高盛：DeepSeek V4对中国AI意味着什么？. ## Deepseek V4第一波测评来了！. ## DeepSeek V4冲击波：百万上下文成标配，Agent底座之争打响在即.","cite_index":1,"site_name":"wallstreetcn.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news251201","title":"DeepSeek V3.2 正式版：强化Agent 能力，融入思考推理","snippet":"# DeepSeek V3.2 正式版：强化 Agent 能力，融入思考推理. 两个月前，我们发布了实验性的 DeepSeek-V3.2-Exp，并收到了众多热心用户反馈的对比测试结果。目前未发现 V3.2-Exp 在任何特定场景中显著差于 V3.1-Terminus，这验证了 DSA 稀疏注意力机制的有效性。也感谢广大用户一直以来的积极反馈与支持，为我们的持续创新注入了更多信心与动力。. 今天，我们同时发布两个正式版模型：**DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale**。官方网页端、App 和 API 均已更新为正式版 DeepSeek-V3.2，欢迎使用。Speciale 版本目前仅以临时 API 服务形式开放，以供社区评测与研究。. 新模型技术报告已同步发布：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2/resolve/master/assets/paper.pdf>. # 推理能力全球领先. * DeepSeek-V3.2 的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用 Agent 任务场景。在公开的推理类 Benchmark 测试中，DeepSeek-V3.2 达到了 GPT-5 的水平，仅略低于 Gemini-3.0-Pro；相比 Kimi-K2-Thinking，V3.2 的输出长度大幅降低，显著减少了计算开销与用户等待时间。. * DeepSeek-V3.2-Speciale 的目标是将开源模型的推理能力推向极致，探索模型能力的边界。V3.2-Speciale 是 DeepSeek-V3.2 的长思考增强版，同时结合了 DeepSeek-Math-V2 的定理证明能力。该模型具备出色的指令跟随、严谨的数学证明与逻辑验证能力，在主流推理基准测试上的性能表现媲美 Gemini-3.0-Pro（见下表）。更令人瞩目的是，V3.2-Speciale 模型成功斩获 IMO 2025（国际数学奥林匹克）、CMO 2025（中国数学奥林匹克）、ICPC World Finals 2025（国际大学生程序设计竞赛全球总决赛）及 IOI 2025（国际信息学奥林匹克）金牌。其中，ICPC 与 IOI 成绩分别达到了人类选手第二名与第十名的水平。. Tips：在高度复杂任务上，Speciale 模型大幅优于标准版本，但消耗的 Tokens 也显著更多，成本更高。目前，DeepSeek-V3.2-Speciale 仅供研究使用，不支持工具调用，暂未针对日常对话与写作任务进行专项优化。. 表1：DeepSeek-V3.2 与其他模型在各类数学、代码与通用领域评测集上的得分（括号内为消耗 Tokens 总量约数）. # 思考融入工具调用. * 不同于过往版本在思考模式下无法调用工具的局限，DeepSeek-V3.2 是我们推出的首个将思考融入工具使用的模型，并且同时支持思考模式与非思考模式的工具调用。我们提出了一种大规模 Agent 训练数据合成方法，构造了大量「难解答，易验证」的强化学习任务（1800+ 环境，85,000+ 复杂指令），大幅提高了模型的泛化能力。. 表2：DeepSeek-V3.2 与其他模型在各类智能体工具调用评测集上的得分. * 如上表所示，DeepSeek-V3.2 模型在智能体评测中达到了当前开源模型的最高水平，大幅缩小了开源模型与闭源模型的差距。值得说明的是，V3.2 并没有针对这些测试集的工具进行特殊训练，所以我们相信，V3.2 在真实应用场景中能够展现出较强的泛化性。. 示例为通过 LobeChat 使用 DeepSeek-V3.2 的深度思考+工具调用能力得到更加详细准确的回复. # 开源. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2>. \\*\\* HuggingFace: <https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Speciale>. \\*\\* ModelScope: <https://modelscope.cn/models/deepseek-ai/DeepSeek-V3.2-Speciale>. # 网页端、APP 与 API 更新. DeepSeek-V3.2 是我们当前正式提供服务的模型，官网网页、APP、API 模型均已由 DeepSeek-V3.2-Exp 升级为正式版 DeepSeek-V3.2，使用方式不变。. 同时，为了方便社区评测与研究，我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. # 思考模式下的工具调用. 本次 API 更新支持了 DeepSeek-V3.2 思考模式下的工具调用能力。当前在思考模式下，模型能够经过多轮的思考 + 工具调用，最终给出更详尽准确的回答。下图为思考模式下进行工具调用的 API 请求示意图：. * 更详细的使用方法请参考 API 文档：<https://api-docs.deepseek.com/zh-cn/guides/thinking_mode>. DeepSeek-V3.2 的思考模式也增加了对 Claude Code 的支持，用户可以通过将模型名改为 deepseek-reasoner，或在 Claude Code CLI 中按 Tab 键开启思考模式进行使用。但需要注意的是，思考模式未充分适配 Cline、RooCode 等使用非标准工具调用的组件，我们建议用户在使用此类组件时继续使用非思考模式。.","cite_index":2,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://www.stcn.com/article/detail/3604331.html","title":"DeepSeek新模型真的要来了？“MODEL1”曝光","snippet":"要闻   金融   评论   产经   创投   滚动. A股   公司   新股   基金   港美股. 来源：第一财经作者：刘晓洁2026-01-21 15:23. 近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在DeepSeek-R1发布一周年之际，新模型“MODEL1”的项目名在开源社区悄然出现。近日，DeepSeek官方在GitHub更新了一系列FlashMLA代码，项目文件有数十处都提到了此前未公开的“MODEL1”大模型标识符。. 在项目中，“MODEL1”标识符与已知的现有模型 “V32”（即 DeepSeek-V3.2）被并列提及。行业认为，根据代码上下文，“MODEL1”很可能代表一个不同于现有架构的新模型。但是具体是V4模型还是推理模型R2行业有不同的看法，也有开发者认为可能是V3系列的终极版。. FlashMLA是DeepSeek独创的、针对英伟达Hopper架构GPU深度优化的软件工具，是DeepSeek模型实现低成本、高性能的关键技术之一，可以在模型架构层面减少内存占用，最大化地利用GPU硬件。. 根据开发者的分析，“MODEL1”与 “V32”在关键技术上存在区别，主要体现在键值（KV）缓存的布局、稀疏性处理方式以及对 FP8 数据格式的解码支持等方面。这些差异表明新架构可能在内存优化和计算效率上进行了针对性设计。. 结合目前模型文件结构来看，“MODEL1”很可能已接近训练完成或推理部署阶段，正等待最终的权重冻结和测试验证。这意味着，新模型的上线时间越来越近了。. “如果我们能再迎来像DeepSeek那样的突破性时刻，那将是具有里程碑意义的。”有海外博主表示。也有网友期待DeepSeek的发布速度能够更快，这对开源社区来说是个好事。. 此前已有报道称，DeepSeek将于2月发布新一代旗舰模型DeepSeek V4，且内部初步测试表明，V4在编程能力上超过了市场上的其他顶级模型。目前DeepSeek并未对此进行任何回应。但此次项目曝光或许也印证了传闻。. 在近一个月里DeepSeek团队陆续发布了两篇技术论文，介绍了名为“优化残差连接（mHC）”的新训练方法，以及一种受生物学启发的 “AI记忆模块（Engram）”。业内猜测，DeepSeek正在开发中的新模型有可能会整合这些最新的研究成果。. DeepSeek在2024年12月推出旗舰模型V3，凭借高效的MoE架构确立了强大的综合性能基础。此后，又在2025年1月发布了推理模型R1，基于强化学习，在解决数学问题、代码编程等复杂推理任务上表现卓越。距离发布已经过去了一年，行业都在期待DeepSeek的下一代旗舰模型。. 恰逢DeepSeek R1发布一周年，海外开源社区Hugging Face也发布了博客《“DeepSeek时刻”一周年》，回顾了中国AI力量在过去一年如何重塑全球开源生态。. 文章指出，DeepSeek-R1是Hugging Face上获赞最多的模型。R1模型的开源不仅降低了推理技术、生产部署与心理三个门槛，更推动了国内公司在开源方向上形成非协同但高度一致的战略走向。. 过去一年，百度、阿里巴巴、腾讯等巨头及月之暗面等初创公司大幅增加开源投入，中国模型在Hugging Face上的下载量已超越美国。尽管西方寻求替代方案，但全球众多初创企业和研究人员正逐渐依赖中国开发的开源模型作为基础，中国AI已深度嵌入全球供应链。. 声明：证券时报力求信息真实、准确，文章提及内容仅供参考，不构成实质性投资建议，据此操作风险自担. 下载\"证券时报\"官方APP，或关注官方微信公众号，即可随时了解股市动态，洞察政策信息，把握财富机会。. 关于我们|服务条例|联系我们|版权声明|网站地图|线索提交. 备案号：粤ICP备09109218号-7|增值电信业务经营许可证：粤B2-20080118|互联网新闻信息服务许可证10120170066|粤公网安备44030002008846号. 违法和不良信息举报电话：0755-83514034 邮箱：bwb@stcn.com 中央网信办违法和不良信息举报中心|证券时报网举报中心. Copyright © 2008-2026 Shenzhen Securities Times Co., Ltd. All Rights Reserved.","cite_index":3,"site_name":"stcn.com","query_indexes":[0]},{"url":"https://news.sciencenet.cn/htmlnews/2026/2/560251.shtm","title":"DeepSeek再扔王炸？官方披露正测试新模型结构—新闻—科学网","snippet":"| |  | | --- | | 作者：范佳来 来源：澎湃新闻 发布时间：2026/2/14 9:20:18  选择字号：小 中  大 | | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 | |. | |  | | --- | |  | |  | | DeepSeek再扔王炸？官方披露正测试新模型结构 | |  |       2月13日，澎湃新闻记者获悉，DeepSeek网页/APP正在测试新的长文本模型结构，支持1M上下文。其API服务不变，仍为V3.2，仅支持128K上下文。  这也被外界认为，DeepSeek或将在今年春节再次“炸场”发布新模型，复刻去年春节现象级轰动。  今年1月12日，DeepSeek曾发布一篇新论文《Conditional Memory via Scalable Lookup:A New Axis of Sparsity for Large Language Models》（基于可扩展查找的条件记忆：大语言模型稀疏性的新维度），梁文锋位列作者名单中，这篇论文为北京大学和DeepSeek共同完成。据分析，这篇论文的核心直指当前大语言模型存在的记忆力“短板”，提出了“条件记忆”这一概念。  当时行业就普遍猜测，DeepSeek的下一代模型V4或将在今年春节前后正式发布。  去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。  据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。  作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。  （原标题：DeepSeek春节再扔王炸？官方披露正测试新模型结构）     特别声明：本文转载仅仅是出于传播信息的需要，并不意味着代表本网站观点或证实其内容的真实性；如其他媒体、网站或个人从本网站转载使用，须保留本网站注明的“来源”，并自负版权等法律责任；作者如果不希望被转载或者联系转载稿费等事宜，请与我们接洽。 |. 去年12月1日，DeepSeek曾经同时发布两个正式版模型：DeepSeek-V3.2 和 DeepSeek-V3.2-Speciale，官方网页端、App和API均已更新为正式版 DeepSeek-V3.2，Speciale版本目前仅以临时API服务形式开放，以供社区评测与研究。. 据介绍，DeepSeek-V3.2的目标是平衡推理能力与输出长度，适合日常使用，例如问答场景和通用Agent（智能体）任务场景。在公开的推理类Benchmark测试中，DeepSeek-V3.2达到GPT-5的水平，仅略低于Gemini-3.0-Pro；相比Kimi-K2-Thinking，V3.2的输出长度大幅降低，显著减少计算开销与用户等待时间。. 作为当之无愧的大模型风向标，DeepSeek一举一动都受到行业整体关注。网易有道词典发布2025年度词汇——“deepseek”以 8672940次年度搜索量成功当选。据有道词典负责人介绍，“deepseek”在词典内部的搜索曲线呈现明显的爆发式特征，从年初因“低成本”突破算力封锁起，几乎每个重要进展都会带动搜索量上涨。. ﻿| 大规模光伏电站对地表温度影响可忽略 | 3D打印沙盘模型超临界无人智能工厂亮相 || 打印“光子织物”，像印报纸一样简单 | 人工神经元成功与活脑细胞“对话” || >>更多 | |. | ﻿  * 1 * 《2026年“人工智能+”行业发展蓝皮书》发布  * 2 * 中国科学院院士戴汝为逝世，享年94岁  * 3 * 迄今最偏心双星系统被发现，或藏距地球最近黑洞  * 4 * 人工神经元成功与活脑细胞“对话”  * 5 * 两位中国学者收获国际大奖，均为首获该奖的亚洲学者  * 6 * 417人，厦门市今年第一批高层次人才人选名单公示  * 7 * 三星堆遗址绿松石制品来源研究获进展  * 8 * 全球山地1公里分辨率近地气温长时序数据集发布  * 9 * 一针长效抗“艾”，仿制药厂商加紧投产  * 10 * 科学家绘制艾滋病病毒如何侵入人体细胞的机制图 | |.","cite_index":4,"site_name":"news.sciencenet.cn","query_indexes":[0]},{"url":"https://zh.wikipedia.org/wiki/DeepSeek-V3","title":"DeepSeek-V3 - 維基百科，自由的百科全書","snippet":"DeepSeek-V3是深度求索於2024年12月16日發布的人工智慧大型語言模型，專門適用於數學、編碼和中文等任務，效能對標GPT-4o等競爭產品。","cite_index":5,"site_name":"zh.wikipedia.org","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/news/news260424","title":"DeepSeek-V4 预览版：迈入百万上下文普惠时代","snippet":"# DeepSeek-V4 预览版：迈入百万上下文普惠时代. 今天，我们全新系列模型 DeepSeek-V4 的预览版本正式上线并同步开源。. DeepSeek-V4 拥有百万字超长上下文，在 Agent 能力、世界知识和推理性能上均实现国内与开源领域的领先。模型按大小分为两个版本：. 即日起登录官网 chat.deepseek.com 或官方App，即可与最新的 DeepSeek-V4 对话，探索 1M 超长上下文记忆的全新体验。API 服务已同步更新，通过修改 model\\_name 为 deepseek-v4-pro 或 deepseek-v4-flash 即可调用。. ## DeepSeek-V4-Pro：性能比肩顶级闭源模型​. **Agent 能力大幅提高：**相比前代模型，DeepSeek-V4-Pro 的 Agent 能力显著增强。在 Agentic Coding 评测中，V4-Pro 已达到当前开源模型最佳水平，并在其他 Agent 相关评测中同样表现优异。目前 DeepSeek-V4 已成为公司内部员工使用的 Agentic Coding 模型，据评测反馈使用体验优于 Sonnet 4.5，交付质量接近 Opus 4.6 非思考模式，但仍与 Opus 4.6 思考模式存在一定差距。. **丰富的世界知识：**DeepSeek-V4-Pro 在世界知识测评中，大幅领先其他开源模型，仅稍逊于顶尖闭源模型 Gemini-Pro-3.1。. **世界顶级推理性能：**在数学、STEM、竞赛型代码的测评中，DeepSeek-V4-Pro 超越当前所有已公开评测的开源模型，取得了比肩世界顶\u0000级闭源模型的优异成绩。. ## DeepSeek-V4-Flash：更快捷高效的经济之选​. 相比 DeepSeek-V4-Pro，DeepSeek-V4-Flash 在世界知识储备方面稍逊一筹，但展现出了接近的推理能力。而由于模型参数和激活更小，相较之下 V4-Flash 能够提供更加快捷、经济的 API 服务。. 在 Agent 测评中，DeepSeek-V4-Flash 在简单任务上与 DeepSeek-V4-Pro 旗鼓相当，但在高难度任务上仍有差距。. ## 结构创新和超高上下文效率​. DeepSeek-V4 开创了一种全新的注意力机制，在 token 维度进行压缩，结合 DSA 稀疏注意力（DeepSeek Sparse Attention），实现了全球领先的长上下文能力，并且相比于传统方法大幅降低了对计算和显存的需求。从现在开始，1M（一百万）上下文将是 DeepSeek 所有官方服务的标配。. ## Agent 能力专项优化​. DeepSeek-V4 针对 Claude Code 、OpenClaw、OpenCode、CodeBuddy 等主流的 Agent 产品进行了适配和优化，在代码任务、文档生成任务等方面表现均有提升。下图为 V4-Pro 在某 Agent 框架下生成的 PPT 内页示例：. ## API 访问​. 目前，DeepSeek API 已同步上线 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 deepseek-v4-pro 或 deepseek-v4-flash。. V4-Pro 与 V4-Flash 最大上下文长度为 1M，均同时支持非思考模式与思考模式，其中思考模式支持 reasoning\\_effort 参数设置思考强度（high/max）。对于复杂的 Agent 场景建议使用思考模式，并设置强度为 max。模型调用与参数调整方法请参考 API 文档。. 请大家注意：旧有的 API 接口的两个模型名 deepseek-chat 与deepseek-reasoner 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向deepseek-v4-flash 的非思考模式与思考模式。. ## 开源权重和本地部署​. 感谢每一位用户的信任与支持，大家的肯定、建议和期许，是我们不竭探索、持续进步的动力，也让我们始终坚守初心，专注于不懈的创新。. 我们将始终秉持长期主义的原则理念，在尝试与思考中踏实前行，努力向实现 AGI 的目标不断靠近。.","cite_index":6,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/updates","title":"更新日志 - DeepSeek API Docs","snippet":"### DeepSeek-V4​. DeepSeek API 已支持 V4-Pro 与 V4-Flash，支持 OpenAI ChatCompletions 接口与 Anthropic 接口。访问新模型时，base\\_url 不变, model 参数需要改为 `deepseek-v4-pro` 或 `deepseek-v4-flash`。. 旧有的 API 接口的两个模型名 `deepseek-chat` 与 `deepseek-reasoner` 将于三个月后（2026-07-24）停止使用。当前阶段内，这两个模型名分别指向 `deepseek-v4-flash` 的非思考模式与思考模式。. ### DeepSeek-V3.2​. `deepseek-chat` 和 `deepseek-reasoner` 都已升级为 DeepSeek-V3.2. ### DeepSeek-V3.2-Speciale​. 我们非正式部署了 DeepSeek-V3.2-Speciale 的 API 服务，API 用户可以通过设置 `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"` 访问该模型。该模型 API 价格不变，只支持思考模式下的对话功能，不支持工具调用等功能，最大输出长度默认为 128K，支持时间截止至北京时间 2025-12-15 23:59。. `base_url=\"https://api.deepseek.com/v3.2_speciale_expires_on_20251215\"`. ### DeepSeek-V3.2-Exp​. `deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.2-Exp。. ### DeepSeek-V3.1-Terminus​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1-Terminus。**`deepseek-chat` 对应 DeepSeek-V3.1-Terminus 的**非思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1-Terminus 的**思考模式**。. ### DeepSeek-V3.1​. **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.1。**`deepseek-chat` 对应 DeepSeek-V3.1 的**非\u0000\u0000思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.1 的**思考模式**。. ### deepseek-reasoner​. **`deepseek-reasoner` 模型升级为 DeepSeek-R1-0528：**. ### deepseek-chat​. **`deepseek-chat` 模型升级为 DeepSeek-V3-0324：**. ### deepseek-reasoner​. ### deepseek-chat​. ### deepseek-chat​. deepseek-chat 模型升级为 DeepSeek-V2.5-1210，模型各项能力提升，相关基准测试：. ### `deepseek-coder` & `deepseek-chat` 升级为 DeepSeek V2.5 模型​. DeepSeek V2 Chat 和 DeepSeek Coder V2 两个模型已经合并升级，升级后的新模型为 DeepSeek V2.5。. 为向前兼容，API 用户通过 `deepseek-coder` 或 `deepseek-chat` 均可以访问新的模型。. 更新详情请跳转文档 API 上线硬盘缓存 2024/08/02. ### deepseek-coder​. deepseek-coder 模型升级为 DeepSeek-Coder-V2-0724。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0628，模型推理能力提升，相关基准测试：. ### deepseek-coder​. `deepseek-coder` 模型升级为 DeepSeek-Coder-V2-0614，代码能力显著提升，在代码生成、代码理解、代码修复和代码补全上达到了 GPT-4-Turbo-0409 的水平，并拥有卓越的数学和推理能力，其通用能力与 DeepSeek-V2-0517 持平。. ### deepseek-chat​. `deepseek-chat` 模型升级为 DeepSeek-V2-0517，模型在指令跟随方面的性能得到了显著提升，IFEval Benchmark Prompt-Level 准确率从 63.9% 跃升至 77.6%。此外，我们对API端的“system”区域指令\u0000跟随能力进行了优化，显著增强了沉浸式翻译、RAG 等任务的用户体验。.","cite_index":7,"site_name":"api-docs.deepseek.com","query_indexes":[0]},{"url":"https://zhuanlan.zhihu.com/p/1981363419455197476","title":"DeepSeek V3到V3.2的进化之路，一文看全 - 知乎专栏","snippet":"这里值得注意的是，DeepSeek V3 是基础模型，而DeepSeek R1 是专用的推理模型。 ... 所以，总的来说，DeepSeek V3.2 比最近的其他一些模型更接近原始的","cite_index":8,"site_name":"zhuanlan.zhihu.com","query_indexes":[0]},{"url":"https://www.deepseek.com/","title":"DeepSeek | 深度求索","snippet":"深度求索（DeepSeek），成立于2023年，专注于研究世界领先的通用人工智能底层模型与技术，挑战人工智能前沿性难题。基于自研训练框架、自建智算集群和万卡算力等资源，","cite_index":9,"site_name":"deepseek.com","query_indexes":[0]},{"url":"https://api-docs.deepseek.com/zh-cn/api/list-models","title":"列出模型 - DeepSeek API Docs","snippet":"列出可用的模型列表，并提供相关模型的基本信息。请前往[模型& 价格](/zh-cn/quick_start/pricing)查看当前支持的模型列表.","cite_index":10,"site_name":"api-docs.deepseek.com","query_indexes":[0]}]}

data: {"p":"response/blocks/-1/status","o":"SET","v":"FINISHED"}

data: {"p":"response","o":"BATCH","v":[{"p":"blocks","o":"APPEND","v":{"id":2,"type":"response","content":"","references":[],"stage_id":1}},{"p":"has_pending_block","o":"SET","v":false}]}

data: {"p":"response/blocks/-1/content","o":"APPEND","v":"根据"}

data: {"v":"现有"}

data: {"v":"搜索结果"}

data: {"v":"，"}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":" "}

data: {"v":"最新的"}

data: {"v":"模型"}

data: {"v":"是"}

data: {"v":"于"}

data: {"v":"202"}

data: {"v":"6"}

data: {"v":"年"}

data: {"v":"4"}

data: {"v":"月"}

data: {"v":"24"}

data: {"v":"日"}

data: {"v":"发布的"}

data: {"v":" **"}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"-V"}

data: {"v":"4"}

data: {"v":" "}

data: {"v":"预览"}

data: {"v":"版"}

data: {"v":"**["}

data: {"v":"citation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]。\n\n"}

data: {"v":"该"}

data: {"v":"模型"}

data: {"v":"的关键"}

data: {"v":"信息"}

data: {"v":"如下"}

data: {"v":"：\n"}

data: {"v":"*"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"版本"}

data: {"v":"系列"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"-V"}

data: {"v":"4"}

data: {"v":" "}

data: {"v":"系列"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]"}

data: {"v":"。\n"}

data: {"v":"*"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"发布时间"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"202"}

data: {"v":"6"}

data: {"v":"年"}

data: {"v":"4"}

data: {"v":"月"}

data: {"v":"24"}

data: {"v":"日"}

data: {"v":"，"}

data: {"v":"该"}

data: {"v":"模型的"}

data: {"v":"预览"}

data: {"v":"版"}

data: {"v":"正式"}

data: {"v":"上线"}

data: {"v":"并"}

data: {"v":"同步"}

data: {"v":"开源"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]"}

data: {"v":"。\n"}

data: {"v":"*"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"主要"}

data: {"v":"特性"}

data: {"v":"**"}

data: {"v":"：\n"}

data: {"v":"   "}

data: {"v":" *"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"百万"}

data: {"v":"上下文"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"拥有"}

data: {"v":"百万"}

data: {"v":"字"}

data: {"v":"（"}

data: {"v":"1"}

data: {"v":"M"}

data: {"v":"）"}

data: {"v":"的超"}

data: {"v":"长"}

data: {"v":"上下文"}

data: {"v":"，"}

data: {"v":"并"}

data: {"v":"成为"}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"所有"}

data: {"v":"官方"}

data: {"v":"服务的"}

data: {"v":"标配"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]"}

data: {"v":"。\n"}

data: {"v":"   "}

data: {"v":" *"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"Agent"}

data: {"v":"能力"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"Agent"}

data: {"v":" "}

data: {"v":"能力"}

data: {"v":"大幅"}

data: {"v":"提高"}

data: {"v":"，"}

data: {"v":"在其"}

data: {"v":"内部"}

data: {"v":"评测"}

data: {"v":"中"}

data: {"v":"，"}

data: {"v":"Agent"}

data: {"v":"ic"}

data: {"v":" Coding"}

data: {"v":" "}

data: {"v":"的使用"}

data: {"v":"体验"}

data: {"v":"优于"}

data: {"v":" Son"}

data: {"v":"net"}

data: {"v":" "}

data: {"v":"4"}

data: {"v":"."}

data: {"v":"5"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]"}

data: {"v":"。\n"}

data: {"v":"   "}

data: {"v":" *"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"推理"}

data: {"v":"性能"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"在"}

data: {"v":"数学"}

data: {"v":"、"}

data: {"v":"STEM"}

data: {"v":"、"}

data: {"v":"竞赛"}

data: {"v":"型"}

data: {"v":"代码"}

data: {"v":"等"}

data: {"v":"测评"}

data: {"v":"中"}

data: {"v":"，"}

data: {"v":"取得了"}

data: {"v":"比"}

data: {"v":"肩"}

data: {"v":"世界"}

data: {"v":"顶级"}

data: {"v":"闭"}

data: {"v":"源"}

data: {"v":"模型的"}

data: {"v":"成绩"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]"}

data: {"v":"。\n"}

data: {"v":"*"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"模型"}

data: {"v":"版本"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"提供"}

data: {"v":"两个"}

data: {"v":"版本"}

data: {"v":"，"}

data: {"v":"**"}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"-V"}

data: {"v":"4"}

data: {"v":"-Pro"}

data: {"v":"**"}

data: {"v":"（"}

data: {"v":"性能"}

data: {"v":"比"}

data: {"v":"肩"}

data: {"v":"顶级"}

data: {"v":"闭"}

data: {"v":"源"}

data: {"v":"模型"}

data: {"v":"）"}

data: {"v":"和"}

data: {"v":" **"}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"-V"}

data: {"v":"4"}

data: {"v":"-F"}

data: {"v":"lash"}

data: {"v":"**"}

data: {"v":"（"}

data: {"v":"更"}

data: {"v":"快捷"}

data: {"v":"经济"}

data: {"v":"）"}

data: {"v":"["}

data: {"v":"citation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]"}

data: {"v":"。\n"}

data: {"v":"*"}

data: {"v":"  "}

data: {"v":" **"}

data: {"v":"API"}

data: {"v":"调用"}

data: {"v":"**"}

data: {"v":"："}

data: {"v":"API"}

data: {"v":" "}

data: {"v":"已"}

data: {"v":"支持"}

data: {"v":"调用"}

data: {"v":"，"}

data: {"v":"通过"}

data: {"v":"修改"}

data: {"v":" `"}

data: {"v":"model"}

data: {"v":"`"}

data: {"v":" "}

data: {"v":"参数"}

data: {"v":"为"}

data: {"v":" `"}

data: {"v":"deep"}

data: {"v":"seek"}

data: {"v":"-v"}

data: {"v":"4"}

data: {"v":"-pro"}

data: {"v":"`"}

data: {"v":" "}

data: {"v":"或"}

data: {"v":" `"}

data: {"v":"deep"}

data: {"v":"seek"}

data: {"v":"-v"}

data: {"v":"4"}

data: {"v":"-fl"}

data: {"v":"ash"}

data: {"v":"`"}

data: {"v":" "}

data: {"v":"即可"}

data: {"v":"使用"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"6"}

data: {"v":"]["}

data: {"v":"citation"}

data: {"v":":"}

data: {"v":"7"}

data: {"v":"]。\n\n"}

data: {"v":"在"}

data: {"v":" Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"-V"}

data: {"v":"4"}

data: {"v":" "}

data: {"v":"预览"}

data: {"v":"版"}

data: {"v":"发布"}

data: {"v":"之前"}

data: {"v":"，"}

data: {"v":"上一个"}

data: {"v":"正式"}

data: {"v":"版"}

data: {"v":"模型"}

data: {"v":"是"}

data: {"v":" **"}

data: {"v":"Deep"}

data: {"v":"Se"}

data: {"v":"ek"}

data: {"v":"-V"}

data: {"v":"3"}

data: {"v":"."}

data: {"v":"2"}

data: {"v":"**"}

data: {"v":"（"}

data: {"v":"及"}

data: {"v":"长"}

data: {"v":"思考"}

data: {"v":"增强"}

data: {"v":"版"}

data: {"v":" V"}

data: {"v":"3"}

data: {"v":"."}

data: {"v":"2"}

data: {"v":"-S"}

data: {"v":"pec"}

data: {"v":"iale"}

data: {"v":"），"}

data: {"v":"于"}

data: {"v":"202"}

data: {"v":"5"}

data: {"v":"年"}

data: {"v":"12"}

data: {"v":"月"}

data: {"v":"1"}

data: {"v":"日"}

data: {"v":"发布"}

data: {"v":"[c"}

data: {"v":"itation"}

data: {"v":":"}

data: {"v":"2"}

data: {"v":"]["}

data: {"v":"citation"}

data: {"v":":"}

data: {"v":"4"}

data: {"v":"]。"}

data: {"p":"response","o":"BATCH","v":[{"p":"accumulated_token_usage","v":7966},{"p":"quasi_status","v":"FINISHED"}]}

data: {"p":"response/status","o":"SET","v":"FINISHED"}

event: update_session
data: {"updated_at":1777732964.109}

event: title
data: {"content":"deepseek 最新的模型是什么"}

event: close
data: {"click_behavior":"none","auto_resume":false}
```

Streamdown 已确认会走 remarkPlugins -> rehype raw -> sanitize -> components，自定义 tag 可以用 allowedTags 放行。实现会生成 <citation cite_index="N">[N]</citation>，再用 components.citation 渲染成 badge。
