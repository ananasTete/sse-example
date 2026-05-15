## 整体交互实现

```
AgentEditorPage
├── editor (useState)
├── editorAgent = useEditorAgent(editor)
│
├── <SelectionContext.Provider value={editorAgent.selectionInfo}>
├── <ActionsContext.Provider value={{ submit }}>
│
├── TiptapEditor
│   └── BubbleMenu → 读 ActionsContext.submit → 触发 chatRef
│
└── AgentChat (ref=chatRef, editorAgent=editorAgent)
    ├── ContextBar → 读 SelectionContext → 显示选区
    ├── 收到 AI 结果 → editorAgent.insertDiffByText / applyEditorAIPatch
    └── 取消按钮 → editorAgent.clearSelectionMode()
```

---

## 选区提交参数设计

### 为什么要上传全文？

核心原因：**AI 需要上下文才能做出合理的编辑。**

举个例子：用户选中一段话让 AI "优化"，AI 需要知道：
- 这段话前后在讲什么（语义连贯性）
- 全文的语气/风格是什么（保持一致）
- 是否有前文定义的术语/人名需要保持

如果只传选区文本，AI 就是在真空中改写，结果很容易和上下文脱节。

### `is_content_equal_full_text` 的存在意义

我推测这个字段是为 **长文档** 预留的降级策略：

| 场景 | 策略 | `is_content_equal_full_text` |
|------|------|-----|
| 短文档（< token 限制） | 上传全文 + 选区标记 | `true` |
| 长文档（超 token 限制） | 只上传选区 ± 周围 N 段 | `false` |

你测不出 `false` 的情况，大概率是因为你的测试文档不够长。当文档超过模型 context window 的合理比例时（比如 10 万字的小说），全文上传就不现实了，这时候需要截断，只传选区附近的上下文。

### 我的建议

对你的产品：

1. **默认上传全文 + 选区标记** — 这是最简单且效果最好的方案
2. **保留 `is_content_equal_full_text` 字段** — 为长文档降级预留接口
3. **选区标记用 `<selection-start/>` `<selection-end/>` 标签** — 这是业界通用做法，对 LLM 友好

### 参数结构设计

```typescript
interface CompletionRequestParams {
  chat_session_id: string
  parent_message_id: number | null
  prompt: string

  // 引用列表（可扩展）
  references: Reference[]

  // 其他选项
  thinking_enabled: boolean
  search_enabled: boolean
}

type Reference =
  | DocumentSelectionReference
  | DocumentReference  // 未来：引用其他文档
  | FileReference      // 未来：引用代码文件等

interface DocumentSelectionReference {
  type: "selection"
  /** 带选区标记的文档内容 */
  content_with_selection: string
  /** 是否包含完整文档（false 时表示截断了） */
  is_full_content: boolean
  /** 来源文档 ID */
  origin_id: string
}
```

### content_with_selection 格式

Markdown + 内联 HTML 的混合格式来保留文档结构

```
对这个当年由自己一手引进黄枫谷的小丫头，韩立印象极深。然而紧接着，马师兄的身影便在心头一掠而过——那个总和蔼笑着、唤他“韩小子”的老头。苍凉之意，如潮水般汹涌而至，将他整个人淹没。

*以小老头*<selection-start></selection-start>*的年纪，决计是没可能结成<span data-color="var(--editor-text-pink)" data-background-color="var(--editor-text-bg-pink)">金丹</span>了。这位黄枫谷中与他最是谈得来*<selection-end></selection-end>*之人，恐怕早已化为一抔黄土，只余下一抔黄土罢了。*

“小丫头！现在的萧师妹可不再是什么小丫头了，而早已嫁人为妇了，并且在数十年前进入了结丹期。”聂盈宜喜宜嗔的说道，唇角边泛起若隐若现的笑意。
```

- *斜体文本* — Markdown 斜体
- `<span data-color="...">金丹</span>` — 内联 HTML 保留编辑器特有的样式标记
- `<selection-start/> / <selection-end/>` — 选区标记嵌在内容流中


### 关于截断策略（未来需要时再实现）

当文档过长时，可以这样截断：

```
[文档开头 500 字]
...
[选区前 2000 字]
<selection-start/>选中内容<selection-end/>
[选区后 2000 字]
...
[文档结尾 500 字]
```

并设 `is_full_content: false`，让 AI 知道它看到的不是全貌。

### 总结

- 上传全文是对的，AI 需要上下文
- `is_full_content` 留着，为长文档降级用
- 用 `references` 数组保持可扩展性
- 当前阶段只实现 `selection` 类型，全文上传 + 选区标记