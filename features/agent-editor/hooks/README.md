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

### `is_full_content` 的存在意义

这是为 **长文档** 预留的降级策略：

| 场景 | 策略 | `is_full_content` |
|------|------|-----|
| 短文档（< token 限制） | 上传全文 + 选区标记 | `true` |
| 长文档（超 token 限制） | 只上传选区 ± 周围 N 段 | `false` |

当文档超过模型 context window 的合理比例时（比如 10 万字的小说），全文上传就不现实，需要截断，只传选区附近的上下文。当前阶段不实现截断，统一传 `true`。

---

## 内容协议：纯文本 + 单 `<selection>` 标签

### 为什么是纯文本，不是 HTML

剧本的内容模型本身就是「带换行的纯文本 + 文本约定」：

```
【屋顶，夜】
郭芙蓉：还有西凉河那回，咱俩要是晚到一步，那一船的人都得让河盗给宰了。
小青：小姐，你怎么知道那是河盗呢？
郭芙蓉：你见过哪个摆渡的不收钱呢？
```

`【】` 标场景、`角色名：` 标对白，都是文本层面的约定。HTML 的 `<p>` 是 Tiptap 在编辑层加上的容器，**不是内容的一部分**。

把 `<p>` 喂给 AI 的副作用：

- AI 改写后可能保留 `<p>` 标签，回插编辑器时还得反向清洗
- 对剧本格式的"风格学习"被 HTML 噪声干扰
- token 浪费

所以序列化阶段不走 `DOMSerializer` / `getHTML()`，直接产出纯文本。

### 为什么是单标签 `<selection>...</selection>`

不用成对的 `<selection-start>` / `<selection-end>`：

- 单 wrapping 元素语义更清楚（"这段是选区" vs "这里有起点、那里有终点"）
- 配对 XML 标签是 LLM 训练语料里最熟悉的结构，命中率更高
- 解析、调试、人眼阅读都更直观
- 跨段落选区下边界依然清晰（见下文）

### 不支持空选区（光标位置）

光标是「用户的注意力指针」，焦点切到 Chat 组件时，编辑器里的光标对用户已经不存在了。即使 Tiptap 内部还保留 selection state，用户也无法把"看不见的位置"和自己的指令对应上——他根本不记得上次点在哪。

所以：

- ContextBar / BubbleMenu 只在有非空选区时显示
- `<selection>` 标签内一定非空
- 如果用户想"在某处续写"，正确的交互是先选中相邻的一段或一字，再触发 action
- 接口层不需要 `selection_mode: "cursor" | "range"` 这类字段

### 协议示例

**选区在段内**：

```
【屋顶，夜】
郭芙蓉：还有西凉河那回，咱俩要是<selection>晚到一步</selection>，那一船的人都得让河盗给宰了。
小青：小姐，你怎么知道那是河盗呢？
```

**选区跨多段**：

```
郭芙蓉：你见过哪个<selection>摆渡的不收钱呢？
小青：（皱眉）小姐……
郭芙蓉：怎么</selection>了？
```

`<selection>` 之前是上文，`</selection>` 之后是下文，中间被改写的内容跨了三段，段间用 `\n` 分隔，结构对 AI 完全清楚。

---

## 序列化策略

复用 `useEditorAgent` 现有的 ProseMirror transaction 思路：在 `range.from` / `range.to` 处插入 boundary 节点，由 PM 统一处理位置映射，避免手算字符偏移。

唯一调整：把输出阶段从 `DOMSerializer` 换成 `doc.textBetween` + `leafText` 回调。

```ts
const tr = editor.state.tr
  .insert(range.to, endBoundary.create())
  .insert(range.from, startBoundary.create());

const text = tr.doc.textBetween(
  0,
  tr.doc.content.size,
  '\n',                    // block separator
  (leaf) => {              // leafText: 由我们决定叶子节点输出什么
    if (leaf.type === startBoundary) return '<selection>';
    if (leaf.type === endBoundary) return '</selection>';
    return '';
  },
);
```

要点：

- **后插 end，先插 start**：先 `insert(to)` 再 `insert(from)`，from 位置不会因前一次插入而失效
- boundary 是 schema 里已有的 inline 节点（`selectionStartBoundary` / `selectionEndBoundary`）
- inline 节点不触发 block separator，跨段落选区不会让 `<selection>` 标签被 `\n` 截断
- 不再需要 `DOMSerializer` / `document.createElement`
- 未来引入自定义 block 节点（场景头、角色名独立节点）时，各自的序列化逻辑各管各的，不影响选区协议

---

## 参数结构

```typescript
interface CompletionRequestParams {
  chat_session_id: string
  parent_message_id: number | null
  prompt: string

  // 引用列表（可扩展）
  at_references: Reference[]

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
  /**
   * 带选区标记的文档纯文本内容。
   * 选区部分由单个 <selection>...</selection> 元素包裹，标签内容必非空。
   */
  content_with_selection: string
  /** 是否包含完整文档（false 时表示截断了） */
  is_full_content: boolean
  /** 来源文档 ID */
  origin_id: string
}
```

### 截断策略（未来需要时再实现）

当文档过长时，可以这样截断：

```
[文档开头若干字]
...
[选区前若干字]
<selection>选中内容</selection>
[选区后若干字]
...
[文档结尾若干字]
```

并设 `is_full_content: false`，让 AI 知道它看到的不是全貌。

---

## 总结

- 内容用纯文本，不上传 HTML
- 选区用单个 `<selection>...</selection>` 元素包裹，标签内非空
- 不支持空选区（光标位置）作为编辑入口
- 序列化复用现有 boundary 节点 + transaction 方案，输出阶段改用 `textBetween` + `leafText`
- 用 `at_references` 数组保持可扩展性，当前阶段只实现 `selection` 类型
- 默认 `is_full_content: true`，全文上传 + 选区标记；长文档降级留接口待用

---

## AI 修改编辑器内容的产品设计

### 两种修改模式

| 模式 | 触发场景 | 渲染位置 | 用户操作 |
|------|---------|---------|---------|
| **直接修改** | AI 判断有确定性答案（错别字、语法、明确的整体重写） | 编辑器内 inline diff | accept / reject |
| **多方案备选** | 局部、风格性、有多种合理表达 | chat 气泡里的候选卡片 | 点选其中一个 |

两种模式都通过 **tool call** 产出，因为都需要结构化数据（位置、原文、新文）供前端解析、渲染、应用。

### 为什么不合并成一个 tool

不用「`alternatives.length === 1` 当成直接修改」的偷懒方案：

- 渲染形态完全不同：inline diff vs chat 卡片
- AI 的决策心智不同："产出 N 个备选" vs "决定要改哪几处"
- 多方案天然只对**单个位置**有意义；多处 × 多方案的笛卡尔积无法被用户消费

### Tool 形态草案

```ts
// 直接修改（可一次返回多处）
propose_inline_edits({
  edits: Array<{
    original_text: string
    new_text: string
    rationale?: string
  }>
})

// 多方案备选（仅针对单个位置）
propose_alternatives({
  original_text: string
  alternatives: Array<{
    new_text: string
    label: string       // 例: "更口语化" / "更书面" / "更短"
    rationale?: string
  }>
})
```

具体字段后续细化。

### 由谁决定走哪种模式

**由 AI 决定**，前端不做硬性切换。在 system prompt 里给 AI 判断准则：

| 维度 | 倾向多方案 | 倾向直接改 |
|------|-----------|-----------|
| 主观性 | 风格、表达（多种对的答案） | 错别字、语法（唯一对的答案） |
| 范围 | 局部短文本 | 大块 / 全文（多方案 token 贵且难比较） |
| 用户措辞 | "给几个选项"/"换种说法" | "改简洁"/"修一下"/"重写" |

**用户措辞是最强信号**，其他维度作为兜底。

AI 也允许选择「不调用任何 tool，只回复建议保留」。tool 是手段不是义务，对剧本这种创作场景，"我建议这句不改"本身就是有价值的反馈。

### 用户选择的状态流转：走 chat 流，不新建 endpoint

用户在多方案卡片里点选某个候选后：

1. **乐观应用到编辑器**：直接 commit 到文档，**不走 inline diff 视图**
2. **发一条特殊消息（或 tool_result）回 chat**：标识 "selected: alt_X"
3. AI 收到后可以 ack 或继续追问

为什么走 chat 流：

- 用户的"选择"语义上就是一次对话动作
- message 树保持完整，AI 知道用户的偏好（后续对话能保持风格一致）
- 分支 / 回放 / 撤回都自然 work
- 新建 endpoint 会导致两条状态更新路径，同步麻烦

为什么选完之后**不再走一次 diff review**：

- 用户在卡片里看到了「原文 vs 候选」并主动选了一个 = review 已经完成
- 再让他点 accept 是重复确认，打断流
- 直接 commit + chat 里把卡片标"已应用"，撤销走编辑器自带 undo

直接修改模式（`propose_inline_edits`）则**必须**走 diff review，因为 AI 单方面下了判断，用户没预览过。

### 落地交互细节

#### 直接 diff 多处的 accept/reject 粒度

每处单独 accept/reject 为主，顶部提供「全部接受」/「全部拒绝」。给用户细控权，又不强迫他点 N 次。

#### 多方案的预览方式

候选卡片用 **diff 形式**渲染（原文标删除、新文标新增），不要只显示 `new_text`。让用户一眼对比改动量和风格差异，避免脑补"和原文比哪儿变了"。

#### 流式产出多方案

候选卡片占位先渲染，文本流式填充。但单个候选**完全产出后**才允许点击选择，避免选到半截文本。

#### 选完之后未被采用的候选

保持可见但置灰、标"未采用"。chat 是历史记录，不擦除。用户后悔可以滚回去重新点（触发"切换选择"流程，由后续协议定义）。

### 总结

- 两种修改模式都是 tool call，但形态分离
- 模式选择由 AI 决定，prompt 里给判断准则；允许"不改"
- 多方案选择走 chat 流而不新建接口；选完直接 commit，不再 review
- 直接 diff 走 inline review；支持单条 accept/reject 和批量
- 多方案候选卡片用 diff 形式展示、流式填充、保留历史
