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
    ├── 监听 message.blocks 中的 tool_call → 在编辑器里插 DiffBlock
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

## AI 响应行为（核心）

两种模式的 AI 输出形态完全不同，由 system prompt 强制：

| 模式 | 触发条件 | 输出形态 | 用户反馈通道 |
|------|---------|---------|------------|
| 选区改写 | `at_references` 含 `selection` | 纯文本 + 多个 fenced code block 候选 | 文字回复 "用 2"，下一轮调 `apply_edit` |
| 全文编辑 | 无 `selection` 引用 | 调用 `propose_edits` 工具 | 编辑器内 DiffBlock 的 ✓/✗ 按钮 |

### 选区模式：候选代码块 + 收尾句

AI 不直接调工具，也不直接改文档。它产出多个 fenced code block 候选，每个候选有差异化标签（语气、风格、长度等），方便用户对比和复制：

```
这里给你三个改写方向：

**1. 紧凑版**：去掉冗余修饰，节奏更快。

​```
…候选 1 文本…
​```

**2. 江湖味**：语气更口语、带点武侠气。

​```
…候选 2 文本…
​```

**3. 简明版**：只保留核心信息。

​```
…候选 3 文本…
​```

告诉我 1 / 2 / 3，我来帮你修改。
```

约束：

- 至少 1 个候选，至多 4 个，每个候选必须放进 fenced code block。
- 每个候选前必须有简短的差异化标签（"紧凑版" / "江湖味" / "正式书面" 等），便于用户区分。
- 收尾句固定为 `告诉我 1 / 2 / 3，我来帮你修改。`（数字按候选数量调整），由 system prompt 写死。
- 用户在下一轮回复 "用 2" 之类时，AI 调用 `apply_edit` 工具完成替换。

为什么用 fenced code block：streamdown 会把它渲染成带"复制"按钮的代码块，用户即使不点应用也能直接复制走，零摩擦。

### 全文模式：`propose_edits` 工具调用

AI 一次性返回所有要改的位置，每条 edit 都会成为编辑器里一个独立的 DiffBlock，用户可以逐条接受/拒绝。

约束：

- 如果 AI 认为不需要修改，**不要调用工具**，用文字回复说明即可（例：「这段已经很流畅了，没什么要改的」）。**禁止返回 `edits: []`**。
- 一次工具调用包含 N 条 edits（N ≥ 1），每条对应一处独立的修改。
- `original_text` 必须是当前文档中的精确子串（不含歧义、能 `indexOf` 命中），用于客户端定位。
- 同一次调用内的 `original_text` 不允许重叠或互相包含。

---

## Edit 锚定单元：段落（Paragraph）

> 这是数据模型上一个重要约定，决定了工具协议、UI 粒度和匹配算法。

### 现状的坑

`useEditorAgent` 的 `insertDiffByText` / `replaceText` 用 `node.isText && node.text.indexOf(originalText)` 在 ProseMirror 的 text node 上找子串。问题：**ProseMirror 的 text node 不会跨段落**，跨段的字符串拼起来永远没有任何一个 text node 含它。

具体场景：

```
郭芙蓉：你见过哪个<selection>摆渡的不收钱呢？
小青：（皱眉）小姐……
郭芙蓉：怎么</selection>了？
```

用户选区横跨 3 个段落。AI 出候选、用户选 2 之后，原本的 `apply_edit` 拿一整段跨 3 段的 `original_text` 去 `indexOf` —— 必然失败。

而且就算硬把跨段字符串拼起来匹配（例如用 `doc.textBetween(0, end, '\n\n')` 全文 dump 后做字符串搜索），UI 上也只剩一个巨型 DiffBlock，丢失了"3 段被改"这层结构信息。

### 约定：edit 锚点 = 一个段落

- `propose_edits.edits[i].original_text` / `new_text` 都是**一个段落（textblock）的完整文本**，禁止包含段间分隔（`\n\n`，对应 schema 里两个 textblock 的边界）。段内换行 `\n`（如 hard break）允许。
- 跨 N 段的改动，AI 必须返回 N 条 edits（同一次工具调用里），每条对应一段。
- 段内子串修改：AI 提交"整段原文 → 整段新文"，客户端 LCS 自动把高亮缩到差异字符上（现成的 `createDiffParagraph` 在做这件事）。

为什么用段落作为锚点：

| 维度 | 字符子串锚（现状） | 段落锚（新） |
|---|---|---|
| 跨段匹配 | 失败 | 天然成立 |
| 短串/重复串歧义 | `indexOf` 容易撞车 | 整段文本几乎唯一 |
| UI 粒度 | 一处 | 一段 → 一个 DiffBlock，跨 3 段 → 3 个 |
| accept/reject 粒度 | 全选 | 段级 |
| 与 `<selection>` 协议 | 不一致 | 段间 `\n` 分隔，刚好对齐 |
| 复用现有命令 | 需手算偏移 | 直接用 `insertParagraphDiffBlock(blockFrom, blockTo, ...)` |

边角情况：

- **段落合并**（A + B → A）：AI 把 A 的 new_text 写成两段合并后的内容，B 的 new_text = 空字符串（空 new_text 即"删除这段"）。
- **段落拆分**（A → A1 + A2）：AI 在 new_text 里塞 `\n\n`，DiffBlock 内部 `splitParagraphText` 已经支持多段渲染，可正确显示。
- 这两种属于少数派，prompt 里说明做法即可，不强加 schema 约束。

### 客户端匹配函数

替换现有的 `findByOriginalBlockText` / `indexOf` 方案，新增 paragraph-aware 定位（含重复段消歧，详见后文 `occurrence_index`）：

```ts
function locateParagraph(
  doc: ProseMirrorNode,
  originalText: string,
  occurrenceIndex = 0,
): { from: number; to: number } | null {
  const candidates: Array<{ from: number; to: number }> = [];

  doc.descendants((node, pos) => {
    // 跳过 pending DiffBlock，不让它干扰后续 edit 的匹配
    if (node.type.name === "diffBlock") return false;
    if (!node.isTextblock) return true;

    const text = node.textBetween(0, node.content.size, "\n");
    if (text === originalText) {
      candidates.push({ from: pos, to: pos + node.nodeSize });
    }
    return true;
  });

  return candidates[occurrenceIndex] ?? null;
}
```

匹配规则：

1. 整段相等优先（强约定，AI 应当遵守）。
2. 多个候选 → 用 `occurrence_index`（默认 0）选定，越界 → null。
3. 找不到时返回 null —— 单条 edit 标记为"定位失败"，不影响其他 edit。

`propose_edits` 命中后调 `editor.commands.insertParagraphDiffBlock(from, to, originalText, newText, suggestionId)`（已存在）。`apply_edit` 命中后用 `tr.replaceWith(from, to, parsedNewParagraphs)` 直接替换。

---

## 工具定义

两个工具都不在服务端做副作用，execute 函数只负责把入参原样返回——它们只是 AI 的结构化输出载体。所有编辑器操作都在客户端发生。

### `propose_edits`（全文模式）

```typescript
interface ProposeEditsInput {
  edits: Array<{
    /**
     * 稳定 id（建议 UUID 或 nanoid），同时作为 DiffBlock 的 suggestionId。
     * 也是 edit 粒度去重记录的 editId（见后文"去重 (edit 粒度)"）。
     */
    id: string;

    /**
     * 一个段落的完整文本。约束：
     * - 必须等于文档中某个 textblock 的全部文本
     * - 不允许包含段间分隔（即不允许 \n\n / 跨多段拼接）
     * - 段内换行 \n 允许
     */
    original_text: string;

    /**
     * 替换后的整段文本。空字符串 = "删除这段"。
     * 段内多换行允许；含 \n\n 表示拆段（少数情况）。
     */
    new_text: string;

    /**
     * 当文档中存在多段文本完全等于 original_text 时，
     * 用 0-based 索引指明命中第 N 个匹配段。
     * 默认 0；段落唯一时省略。
     */
    occurrence_index?: number;

    /**
     * 一句话说明改动理由，可选。
     * 当前用于工具块的摘要展示，不进入 DiffBlock。
     */
    rationale?: string;
  }>;
}
```

为什么是"一个工具多条 edits"，不是多次工具调用：

- AI SDK 的 `streamText` 在多个 tool-call 串行下发时容易被 stop 截断。
- 客户端记录粒度按 edit（见"去重（edit 粒度）"），跨段改动天然要求"多条 edits 一次返回"，逻辑上是一组原子修改。
- 单条修改也用同一接口（数组长度为 1）。

### `apply_edit`（选区模式，用户确认后）

```typescript
interface ApplyEditInput {
  /**
   * 用户选择的候选要应用到的所有段落。
   * 跨段选区 → 多条 edits，每条对应一段（与 propose_edits 同规则）。
   */
  edits: Array<{
    /** 段落完整原文，定位用 */
    original_text: string;
    /** 段落替换后内容，可为空字符串（删除该段） */
    new_text: string;
    /** 重复段消歧，0-based，默认 0 */
    occurrence_index?: number;
  }>;

  /** 来源文档 ID，沿用上一轮 at_references 的 origin_id */
  origin_id?: string;
}
```

`apply_edit` 不进 DiffBlock，直接 replace —— 用户已经在卡片层完成了选择决策，再走一遍 ✓/✗ 是冗余。但匹配单元和段落级约束与 `propose_edits` 完全一致，避免两套规则。

### 跨段拆分由谁完成？

**AI 完成**。前端请求体 shape 不变，后端不做拆分。三层职责：

| 层 | 是否拆分 | 做什么 |
|---|---|---|
| 前端 | 否 | `at_references[0].content_with_selection` 仍然是单个 `<selection>...</selection>` 包裹的整段文档；跨段选区在标签内用段间分隔符隔开 |
| 后端 | 否 | 透传 prompt + at_references；只在装载历史时把 ASSISTANT 的工具调用还原成 ModelMessage（多轮上下文） |
| AI | 是 | 按 system prompt 约束，把跨段改写产出为 N 条 edits（`propose_edits` / `apply_edit`），一段一条 |

为什么不在前端拆：前端不知道 AI 想把每一段改成什么，只能输出 N 条空 `new_text` 模板。

为什么不在后端拆：后端是 SSE 透传层，加一层模型语义解析既增加延迟也难调试。

### 段间分隔符统一到 `\n\n`

`buildDocumentSelectionReference` 当前用 `doc.textBetween(..., "\n")` 作为 block separator。这与"段间分隔 = `\n\n`"的新约定不一致，AI 看到 `<selection>` 内的段不知道哪里是段边界。

**改动**：把序列化用的 block separator 从 `"\n"` 升到 `"\n\n"`（`buildDocumentSelectionReference` 内的两处 `textBetween`）。这样：

- AI 看到的文档是 `段1\n\n段2\n\n<selection>段3部分\n\n段4\n\n段5部分</selection>\n\n段6`，段边界清晰。
- `propose_edits.edits[i].original_text` 直接对应 `<selection>` 内某一段的"`\n\n` 之间"片段，AI 拆分有明确锚。
- 段内换行（hard break，`\n`）仍可保留并不与段间分隔混淆。

请求体的字段名、字段数量、类型都不变，只是 `content_with_selection` 字符串内部的换行从 `\n` 变成 `\n\n`。

## 重复段消歧：`occurrence_index`

> 段落锚把冲突概率从"几乎必然"降到"少数情况"，但没彻底消除。

### 残留的重复场景

虽然整段文本比子串唯一性高得多，但剧本里仍有真重复：

- 空段、纯标点段（spacer）。
- 短对白：`"嗯。"` `"好的。"` `"是。"`
- 跨场次复用的旁白或场景头。

只靠"整段文本相等"匹配，遇到 5 个相同的 `"嗯。"` 还是只能命中第一个。

### 加一个 `occurrence_index` 字段

`propose_edits.edits[i]` / `apply_edit.edits[i]` 增加一个可选字段：

```ts
{
  original_text: string;
  new_text: string;
  /**
   * 当文档中存在多段文本完全等于 original_text 时，
   * 用 0-based 索引指明命中第 N 个匹配段。
   * 默认 0；段落唯一时可省略。
   */
  occurrence_index?: number;
  // ...
}
```

为什么不选其他方案：

| 方案 | 优点 | 缺点 |
|---|---|---|
| 前后段邻居作 anchor | 不需 AI 计数 | AI 易漏写；多 edit 互相改动后 anchor 失效 |
| 在序列化里给段加可见 ID（`[P3]`） | 最稳定 | 污染内容、token 浪费、容易被 AI 抄进 new_text |
| `occurrence_index`（选用） | 99% 的 edit 用不到这字段；AI 只在重复时数一下 | 重复多的极端文档对 AI 计数能力有要求 |

### 客户端匹配规则

```ts
function locateParagraph(
  doc: ProseMirrorNode,
  originalText: string,
  occurrenceIndex = 0,
): { from: number; to: number } | null {
  const candidates: Array<{ from: number; to: number }> = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, "\n");
    if (text === originalText) {
      candidates.push({ from: pos, to: pos + node.nodeSize });
    }
    return true;
  });

  return candidates[occurrenceIndex] ?? null;
}
```

规则：

- 0 个候选 → 定位失败（文档已被修改 / AI 错把跨段拼成一条 / 段内子串）。
- N 个候选 → 取 `candidates[occurrence_index ?? 0]`；越界 → 定位失败。
- 失败的 edit 计入工具块摘要的"M 条无法定位"，不阻塞其他 edit。

### Prompt 中要明确说明

system prompt 增加（节选）：

> 如果同一段完整文本在文档中出现多次（例如多个 `"嗯。"`），用 `occurrence_index` 指明你要改的是第几个（0-based）。绝大多数段落是唯一的，可省略此字段。
>
> 同一次工具调用里若同时改多个相同文本的段，每条 edit 用不同的 `occurrence_index` 区分。

### 与 DiffBlock 的相互作用

`propose_edits` 插入 DiffBlock 后，原段落被 `diffBlock` 节点替换。匹配函数遍历时应跳过 `diffBlock`，避免后续 edit 把 pending 的 DiffBlock 误算进 candidates：

```ts
if (node.type.name === "diffBlock") return false; // 不进入子节点
```

`apply_edit` 同理：用户 accept / reject 之前如果有 pending DiffBlock，匹配时跳过它。

### Prompt 段落约束（合并版）

system prompt 必须显式说明（节选）：

> 每条 edit 的 `original_text` 与 `new_text` 都是文档中**完整一段**的文本（段间用 `\n\n` 分隔），不要把多段拼成一条。如果你的修改横跨 N 段，必须返回 N 条 edits，每条对应一段。
>
> 段内的小修改（仅替换某个词）也走"整段 original_text → 整段 new_text"的形式，客户端会自动只高亮变化的字符。
>
> 如果某段需要被整体删除，把 `new_text` 设为空字符串。
>
> 如果你想把一段拆成两段，可以在 `new_text` 中使用 `\n\n` 表示新的段间分隔。
>
> 如果同一段完整文本在文档中出现多次（例如多个 `"嗯。"`），用 `occurrence_index` 指明改第几个（0-based）。绝大多数段落是唯一的，可省略。同一次工具调用里若同时改多个相同文本的段，每条 edit 用不同的 `occurrence_index`。

---

---

## 服务端必须支持多轮上下文

### 现状（缺陷）

`src/server/session-chat/chat-completion.ts` 当前调用 `streamText` 时只传了当前轮的 `prompt`：

```ts
const result = streamTextFn({
  model: ...,
  prompt: buildPromptWithReferences(body.prompt, body.at_references),
  // ...
});
```

没有读取数据库里同会话的历史消息，每一轮都是"全新对话"。这对于纯问答场景可以接受，但选区模式的两轮交互会直接坏掉：

```
T1  用户   选中 "晚到一步"，让 AI 给候选
T1  AI    ```候选 1 ......``` ```候选 2 ......``` ```候选 3 ......```
                告诉我 1 / 2 / 3，我来帮你修改。
T2  用户   "用 2"
T2  AI    ❌ 不知道"2"指的是什么 —— 看不到 T1 的回复
```

### 修复

把 `prompt` 字段换成完整的 `messages` 数组，按时间顺序装入当前会话的所有 USER / ASSISTANT 历史：

```ts
import type { ModelMessage } from "ai";

async function loadConversationMessages(
  chatSessionId: string,
  currentTurn: { userPrompt: string; references: AtReference[] },
): Promise<ModelMessage[]> {
  // 拉历史（不包括本轮已新建的 user/assistant 占位消息）
  const history = await prisma.chatMessage.findMany({
    where: {
      chatSessionId,
      status: "FINISHED",
      role: { in: ["USER", "ASSISTANT"] },
    },
    orderBy: { localId: "asc" },
    include: { blocks: { orderBy: { localId: "asc" } } },
  });

  const messages: ModelMessage[] = history.map((msg) => ({
    role: msg.role === "USER" ? "user" : "assistant",
    content: serializeBlocksToModelContent(msg.blocks),
  }));

  // 追加本轮 user 消息（带 at_references 渲染）
  messages.push({
    role: "user",
    content: buildPromptWithReferences(
      currentTurn.userPrompt,
      currentTurn.references,
    ),
  });

  return messages;
}

// streamText 调用处
const result = streamTextFn({
  model: ...,
  system: SYSTEM_PROMPT,
  messages: await loadConversationMessages(body.chat_session_id, {
    userPrompt: body.prompt,
    references: body.at_references,
  }),
  // ...
});
```

### `serializeBlocksToModelContent` 要点

历史消息的 blocks 不能简单 join 成字符串，否则 AI 看到的是文本噪音。规则：

| Block 类型 | 转换 |
|-----------|------|
| `text` | 直接拼到 content 字符串 |
| `reasoning` | 跳过（不喂给模型，避免 thinking 内容污染上下文） |
| `tool_call`（USER 不会有，ASSISTANT 才有） | 还原成 AI SDK 的 `tool-call` part；同时构造一条对应的 `role: "tool"` 消息携带 output |
| `search` | 跳过或摘要化（当前 agent-editor 不开 search） |

**`propose_edits` / `apply_edit` 的工具调用必须保留在历史里**——AI 在 T2 看到"T1 我调了 propose_edits 改了这几处"，才能在 T2 自然衔接（比如用户说"再改激进点"，AI 知道是基于上一轮的修改）。

工具调用历史的还原形态（AI SDK ModelMessage）：

```ts
{ role: "assistant", content: [
  { type: "text", text: "..." },
  { type: "tool-call", toolCallId, toolName: "propose_edits", input: { edits: [...] } },
]}
{ role: "tool", content: [
  { type: "tool-result", toolCallId, toolName: "propose_edits", output: { edits: [...] } },
]}
```

### 历史长度控制

- 当前阶段不做截断，全部喂入。剧本场景一个会话一般不会超过 20 轮。
- 长会话的截断策略（保留最近 N 轮 + 系统约束 + 当前 `at_references`）留到出现 token 压力时再加。
- `at_references` 只挂在**当前轮**的 user message 上，不重复进历史——历史里 user message 的纯文本已经隐含了上一轮选区是什么文本（fenced code block 候选已经包含），不必重复传 `<selection>` 标签全文。

### resume_stream 不受影响

`resumeChatCompletionStreamHandler` 只重放已有 assistant message 的快照，不会触发新的模型调用，不需要改。

---

## 编辑器 diff 的实现：Node 而非 Decoration

> 能不能用 Decoration 实现？— "看起来像"可以，"刷新还能看到"不行。

| 维度 | Decoration | Node（现有 DiffBlock） |
|---|---|---|
| 进入文档内容 | 否 | 是 |
| `getJSON()` 序列化 | 否 | 是 |
| 刷新还原 | 必须额外存"原文+新文+位置"再重建装饰 | 自动还原 |
| 接受/拒绝命令 | 需自己写 transaction 改文档 | 现成的 `acceptDiff` / `rejectDiff` |
| 跨段落 / 嵌段落级结构 | 仅能加 className，不能改结构 | 段落 + DiffChange mark 已支持 |

「用户不点接受、刷新还能看到 diff」直接把 Decoration 排除了。Decoration 由 Plugin state 在运行时派生，不属于文档；要持久化得自己维护一份并行 metadata，反而比 Node 复杂。

### 持久化通道

DiffBlock 是 schema 里的 Node，天然进入文档树：

```
editor.getJSON() → JSONContent（含 DiffBlock 节点 + DiffChange mark）
  → saveAgentEditorDocument() → localStorage
  
loadAgentEditorDocument() → JSONContent
  → editor 初始化 content → DiffBlock 节点自动渲染
  → ✓/✗ 按钮立即可用，acceptDiff / rejectDiff 命令照常工作
```

**不需要新增任何持久化层。** 现有 `services/document-storage.ts` 的 JSON 快照已经包含了 DiffBlock 状态。用户不点接受、关页面、再回来，diff 仍在。

接受或拒绝后，`acceptDiff` / `rejectDiff` 会把 DiffBlock 节点替换成普通段落，`update` 事件触发 `saveAgentEditorDocument`，新状态被自然写回。

---

## 客户端工具调用 → 编辑器流程（全文模式）

```
SSE patch
  → AgentChatState.chat_messages[i].blocks[j] 出现 type=tool_call, tool_name=propose_edits
  → block.status: "WIP" → "FINISHED"
  → AgentChat 的 effect 检测到该 toolCallId 首次进入 FINISHED
  → 读取 block.input[0].edits（stream-bridge 把 input 包成单元素数组）
  → 对每条 edit:
       pos = locateParagraph(doc, edit.original_text, edit.occurrence_index ?? 0)
       if (pos) editor.commands.insertParagraphDiffBlock(pos.from, pos.to, ...)
       else 累计失败
  → 编辑器写入 DiffBlock，update 事件触发 saveAgentEditorDocument 持久化
```

### 去重（edit 粒度）

工具调用可能被多次"看到"：刷新拉历史、`resume_stream`、组件 re-mount。但只在 `toolCallId` 粒度记录"已应用"会把失败永久封死：

- 工具块到达时编辑器还没 ready（`editor === null`）→ 整组被跳过且不再尝试。
- 部分定位失败 → 失败那几条没机会重试，即使用户撤销了让原段重新出现。
- 用户主观希望重新应用（rejectDiff 后又改主意）→ 也被堵死。

所以记录粒度下沉到 **edit**，并区分 applied / failed 状态：

```ts
type EditApplyState =
  | { status: "applied"; appliedAt: number }
  | {
      status: "failed";
      reason: "not-found" | "occurrence-out-of-range" | "editor-not-ready";
      lastTriedAt: number;
    };

interface EditApplyRecord {
  sessionId: string;
  messageId: number;
  toolCallId: string;
  /** propose_edits 用 edit.id；apply_edit 没稳定 id，用 `${toolCallId}-${index}` */
  editId: string;
  /** 当前文档版本：editor.state.doc 的 hash 或单调递增 ver */
  documentVersion: string;
  state: EditApplyState;
}
```

存储：localStorage `agent-editor:edit-apply:v1`，索引键 `(toolCallId, editId)`。

应用流程：

```
对每条 edit:
  record = lookup(toolCallId, editId)

  // 1. 已成功的不重试
  if (record?.state.status === "applied") continue;

  // 2. 同版本失败过，避免无效重试
  if (record?.state.status === "failed"
      && record.documentVersion === currentDocVersion) continue;

  // 3. 真正尝试
  pos = locateParagraph(doc, edit.original_text, edit.occurrence_index ?? 0);
  if (!pos) {
    persist({ ...record, state: { status: "failed", reason: "not-found", lastTriedAt: now }, documentVersion: currentDocVersion });
    continue;
  }
  editor.commands.insertParagraphDiffBlock(...);
  persist({ ...record, state: { status: "applied", appliedAt: now }, documentVersion: currentDocVersion });
```

`documentVersion` 是关键：它让 "失败 + 文档变化 → 自动重试" 成为合理路径。用户撤销让原段重新出现时，version 变更触发重试机会，不必手动操作。

兜底：DiffBlock 存在性检查仍然保留——插入前用 `editor.state.doc.descendants` 查一遍 `suggestionId === edit.id`，存在就跳过。覆盖 localStorage 被清、跨设备同步等极端场景。

### 失败 UI

工具块摘要卡片按 edit 状态分组展示：

```
✎ 已建议 5 处修改
   ✓ 已应用 3 条
   ⚠ 2 条无法定位（点 [重试] 或 [复制] 手动处理）
       • "晚到一步" → "慢一步"   [复制] [重试]
       • "嗯。"     → "嗯，知道了。"   [复制] [重试]
```

- **复制**：把 `new_text` 复制到剪贴板，与选区模式 fenced code block 的复制体验一致。
- **重试**：清掉这条 edit 的 record，立即触发一次匹配尝试。如果文档刚好回到能匹配的状态（用户撤销了改动），就此成功；否则照常落"failed + 新 documentVersion"。

### `apply_edit` 流程（选区模式）

```
SSE patch
  → tool_call: tool_name=apply_edit, status=FINISHED
  → 读取 input[0].edits（数组）
  → 对每条 edit 走与 propose_edits 相同的去重 + 匹配流程
  → 命中：tr.replaceWith(from, to, parsedNewParagraphs)（直接替换，不进 DiffBlock）
  → 未命中：写入 failed record，进失败 UI
```

不走 DiffBlock，直接替换；edit 粒度的去重逻辑保证刷新/重连不重复执行，且失败可重试。多条 edits 应用时按 `from` 倒序提交，避免位置偏移。

### 失败兜底

`locateParagraph` 返回 null 时（用户在 AI 响应前修改了文档、段落已被其他 DiffBlock 替换、AI 错误地拼了跨段文本，或 `occurrence_index` 越界）：

- 不抛错，不阻塞下一条 edit。
- 该条 edit 写入 failed record（带当前 documentVersion）。
- 工具块的摘要卡片显示"M 条无法定位"，每条提供「复制」「重试」按钮。
- 已成功的 edits 不受影响。

---

## 工具块 UI

`AgentChatMessageList` 经由 `BlockRenderer` 把工具块渲染出来。两个新工具走 `customRenderers`，不用默认的 `GenericToolView`。

### `propose_edits` 卡片

简洁摘要，不复述 diff（左侧编辑器才是 diff 的展示位）：

```
✎ 已建议 3 处修改（去左侧查看）
   • 替换"晚到一步" → …          [rationale]
   • 替换"摆渡的不收钱呢？" → …
   • 替换"怎么了？" → …
```

每条 edit 有就近定位按钮（点击 → `editor.commands.scrollIntoView` 到对应 DiffBlock）。

### `apply_edit` 卡片

更轻：

```
✓ 已应用：晚到一步 → 慢一步
```

---

## 改动清单

### 前置（必须先做，否则 TS / UI 会同时别扭）

- `features/agent-editor/chat/types.ts` — `AgentChatMessageBlock` 联合类型加上 `AgentChatToolCallBlock`：
  ```ts
  export type AgentChatMessageBlock =
    | TextBlock
    | WebSearchBlock
    | ReasoningBlock
    | AgentChatToolCallBlock;
  ```
  当前类型显式排除了 `ToolCallBlock`，但 parser 已经能装下 `tool_call` block，只是声明缺位。
- `features/agent-editor/chat/components/agent-chat-message-list.tsx` — `AssistantBlocks` 把 `BlockRenderer` 改成接收 `customRenderers={ propose_edits, apply_edit }`，由父级注入。两个 view 还需要从父组件接收 `editorAgent` 引用（用于"就近定位"和"重试"按钮）。

### 新增

- `features/agent-editor/services/edit-apply-records.ts` — edit 粒度的 apply 记录 localStorage 封装，含 `lookup` / `markApplied` / `markFailed` / `clearForEdit` API。
- `features/agent-editor/components/propose-edits-block.tsx` — `propose_edits` 工具块的摘要视图（applied / failed / pending 分组，failed 行带「复制」「重试」）。
- `features/agent-editor/components/apply-edit-block.tsx` — `apply_edit` 工具块的轻量摘要，同样支持 failed 行的复制 / 重试。
- `src/server/session-chat/tools/propose-edits.ts` / `apply-edit.ts` — 工具定义（execute 直接返回入参）。
- system prompt 文本（建议放 `src/server/agent-editor-chat/prompts.ts`）：包含选区模式的输出格式约束、收尾句、全文模式的 `propose_edits` 触发条件、段落约束、`occurrence_index` 用法。

### 修改

- `src/server/session-chat/chat-completion.ts` —
  - 在 agent-editor 路径注册两个新工具，注入 system prompt。注意 agent-editor 当前直接复用 session-chat 的 handler，需要扩参或新建专用 handler 把工具集合注入。
  - **把 `streamText({ prompt })` 改成 `streamText({ messages })`**，从数据库加载当前会话的全部 USER / ASSISTANT 历史消息（含工具调用），见上文"服务端必须支持多轮上下文"。这是选区模式两轮交互能跑通的前提。
- `features/agent-editor/services/selection-reference.ts` — `buildDocumentSelectionReference` 内两处 `textBetween` 的 block separator 从 `"\n"` 升到 `"\n\n"`，对齐"段间分隔 = `\n\n`"的新约定。请求体 shape 不变。
- `features/agent-editor/components/agent-chat.tsx` — 新增 effect：监听 `chatState.chat_messages` 中新进入 FINISHED 的工具块，按 edit 粒度走"去重 → 匹配 → 应用 / 失败记录"流程，分发到 `insertParagraphDiffBlock` / `replaceWith`。

### 废弃（新流稳定后删除）

- `features/agent-editor/services/editor-ai-context.ts` 里的 `editorAIPendingRegistry` / `applyEditorAIPatch` / `createEditorAIRequest`。运行时快照模式被工具调用流取代。保留 `buildDocumentSelectionReference`，仍被 `at_references` 使用。
- `features/agent-editor/components/message-list.tsx`、`features/agent-editor/components/suggestion-card.tsx` — 旧的 suggest_rewrite / suggest_edit 卡片流，已无人订阅。
- `useEditorAgent` 中 `replaceSelection`、`insertMultipleDiffs`、`scrollToPosition` 中无新引用方暂保留；`createAIRequest` 删除。

---

## 总结

- **选区模式**：AI 出多个差异化标签的 fenced code block 候选，固定收尾句让用户报数；用户回复后下一轮调 `apply_edit`，按段直接 replace。
- **全文模式**：AI 调 `propose_edits`，多条 edits 一次返回，每条对应一个段落，跨段改动 = N 条 edits → N 个 DiffBlock，逐条 ✓/✗。
- **edit 锚点 = 段落**：`original_text` 必须等于某个 textblock 的完整文本；解决跨段选区匹配失败和 UI 粒度坍缩问题。
- **重复段消歧** 用可选的 `occurrence_index`（默认 0），覆盖 `"嗯。"` `"好的。"` 这类高频短句的极少数情况。
- **多轮上下文**：服务端从 `prompt` 切到 `messages`，加载会话历史（含工具调用），否则选区模式第二轮拿不到 "2" 的语义。
- **不返回工具调用** = AI 觉得不需要改，用自然语言说明即可（禁止 `edits: []`）。
- **持久化** 走现有的 `editor.getJSON()` → localStorage 通道，DiffBlock 是 schema Node 自动序列化，刷新后状态完整还原。
- **去重粒度 = 单条 edit**（`{toolCallId, editId, documentVersion}`），区分 applied / failed 状态；失败可重试可复制，避免把临时失败永久封死。
- **类型 / UI 前置工作**：`AgentChatMessageBlock` 联合类型补回 `ToolCallBlock`；`AgentChatMessageList` 给 `BlockRenderer` 注入 `customRenderers`。否则 TS 与 UI 会同时拧巴。
- 不引入 Decoration 方案，理由是无法持久化。
