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
3. **选区标记用 `<selection-start></selection-start>` `<selection-end></selection-end>` 标签** — 这是业界通用做法，对 LLM 友好

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

### 关于截断策略（未来需要时再实现）

当文档过长时，可以这样截断：

```
[文档开头 500 字]
...
[选区前 2000 字]
<selection-start></selection-start>选中内容<selection-end></selection-end>
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


---

# 剧本编辑器节点系统 + AI 卡片改写 最终方案

## 〇、方案总览

这次重构包含两条主线：

1. **剧本节点重构**：用 7 种语义节点（场次 / 动作 / 角色 / 对话 / 转场 / 注释 / 字幕）替换现有结构，配合 5 个气泡菜单完成结构化输入。
2. **AI 改写从 inline Diff 切到 ToolCall 卡片**：放弃 `DiffBlock`，AI 通过 `propose_edits` 工具返回结构化编辑建议，由聊天端卡片承载预览、多候选、应用、撤销等交互。

两条主线对应的目录调整：

```
features/rich-editor/
├── extensions/
│   ├── script-nodes/                  // 七种节点 + 共享工具
│   │   ├── index.ts
│   │   ├── scene-heading.tsx          // atom + ReactNodeView
│   │   ├── action.ts
│   │   ├── character.ts
│   │   ├── dialogue.ts
│   │   ├── transition.ts
│   │   ├── note.ts
│   │   ├── subtitle.ts
│   │   └── sequence-number-plugin.ts
│   ├── script-menu-controller.ts      // 气泡菜单全局状态机
│   ├── pending-edits-highlight.ts     // AI 卡片对应的左侧 indicator
│   ├── ai-selection-highlight.ts      // 保留
│   ├── ai-selection-boundary.ts       // 保留
│   ├── slash-command.ts               // 保留，items 重排
│   └── underline.ts                   // 保留
├── script-menus/                      // 五个气泡菜单
│   ├── shell.tsx
│   ├── use-list-navigation.ts
│   ├── location-menu.tsx
│   ├── time-menu.tsx
│   ├── int-ext-menu.tsx
│   ├── character-menu.tsx
│   ├── transition-menu.tsx
│   └── script-menus.css
├── bubble-menu/                       // 保留，bubble-menu-config 同步更新
├── slash-command/                     // 保留，commands 同步更新
├── editor.css
├── editor.tsx
└── index.tsx

features/agent-editor/
├── services/
│   ├── editor-ai-context.ts           // 重写：选区扩展 + 不再生成 snapshot
│   ├── propose-edits-schema.ts        // 新增：tool call 协议
│   ├── anchor-resolver.ts             // 新增：anchor → from/to 解析
│   ├── edit-applier.ts                // 新增：apply / undo 单条 edit
│   └── edits-store.ts                 // 新增：卡片组状态（zustand）
├── components/
│   ├── ai-edits-cards.tsx             // 新增：卡片组容器
│   ├── ai-edit-card.tsx               // 新增：单卡片
│   └── ai-edit-card.css
└── hooks/
    └── use-editor-agent.ts            // 改：去掉 patch / snapshot 逻辑
```

`extensions/diff-block.tsx`、`hooks/use-stream-writer.ts`、`server/chat/editor-ai-protocol.ts` 中与 inline diff 相关的代码 **全部废弃**；`use-stream-writer` 如果其它流式场景仍需要保留，可移到独立目录、不再绑定 AI 改写。

---

## 一、剧本节点 Schema

### 1.1 SceneHeading（atom + ReactNodeView）

```ts
{
  name: "sceneHeading",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    location: "",   // 地点
    time: "",       // 日 / 夜 / 午 / 晨 / 暮 / 接续 / 稍后 / 片刻后 / 同时
    intExt: "",     // 内 / 外 / 内/外 / 外/内
  },
  parseHTML() { return [{ tag: "scene-heading", getAttrs }]; },
  renderHTML({ HTMLAttributes }) {
    return ["scene-heading", { ... 三个属性 ... }];
  },
  addNodeView() { return ReactNodeViewRenderer(SceneHeadingView); },
}
```

NodeView 内部结构：

```
[N.] [Location chip]  [Time chip] / [IntExt chip]
```

* `N.` 与 `/` 用 `contentEditable={false}` 包裹（满足 R1.3、R1.5）。
* 三个 chip 都是 button，点击 dispatch `openScriptMenu(name, { pos })`。
* 空值显示占位文本（`选择地点` / `时间` / `内外景`）。
* `parseHTML.getAttrs` 兼容旧版纯文本 `<scene-heading>1. 内景 教室 日 ...</scene-heading>`：正则尝试拆 attrs，失败时把整段文本塞进 `location`。

### 1.2 自动序号插件

`sequence-number-plugin.ts`：

* 纯装饰，不写回 attrs；
* `decorations(state)` 中遍历 `doc.descendants`，每遇 `sceneHeading` 就 `Decoration.widget(pos + 1, makeBadge(n), { side: -1 })`；
* 插入 / 删除 / 移动后 React 一次性重算，满足 R1.2 / R1.4；
* 序号 widget 不进入 `getHTML`。

### 1.3 其它六个节点

| 节点 | tag | content | Enter 后 | 自动弹菜单 | 关键样式 |
| --- | --- | --- | --- | --- | --- |
| `action` | `<action>` | `inline*` | `action` | — | 普通段落 |
| `character` | `<character>` | `inline*` | `dialogue` | 进入空节点弹 Character_Menu | 不再强制 center，CSS 控制 |
| `dialogue` | `<dialogue>` | `inline*` | `character` | — | 不再强制 center |
| `transition` | `<transition>` | `inline*` | `action` | 进入节点弹 Transition_Menu | `text-align: right` |
| `note` | `<note>` | `inline*` | `action` | — | blockquote 风格（左竖线 / 缩进 / 斜体灰字） |
| `subtitle` | `<subtitle>` | `inline*` | `action` | — | `padding-left: 32px; font-weight: 700; font-style: italic` |

`scene` 节点删除（R5.1 / R11.2）。`character` 不再自动追加 `:`，由 CSS 显示提示符或不显示由产品决定。

### 1.4 节点流转表

```
sceneHeading.Enter  → 新建 action（atom 节点的 keymap 在节点选中态处理）
action.Enter        → action
character.Enter     → dialogue
dialogue.Enter      → character
transition.Enter    → action
note.Enter          → action
subtitle.Enter      → action
```

`Tab` 在 location 菜单内捕获用于切到 time 菜单，不动节点 keymap。

### 1.5 序列化结果

`getHTML()`：

```html
<scene-heading location="教室" time="日" int-ext="内"></scene-heading>
<action>小芸坐在窗邊...</action>
<character>小芸</character>
<dialogue>你昨天有念书吗？</dialogue>
<character>阿良</character>
<dialogue>沒有耶...</dialogue>
<transition>淡出至</transition>
<subtitle>三天后</subtitle>
<note>这里需要一段空镜过渡。</note>
```

`getJSON()`：sceneHeading 是 `{ type, attrs }`、其余节点是 `{ type, content: [{ type: "text", text }] }`。序号、`/`、占位文字均不进入序列化。

### 1.6 旧文档兼容

`<scene>` 节点解析为 `<action>`：通过 `extension.addExtensions` 注册一个仅做 parseHTML 的兼容节点，挂在 `action` 的 parseHTML 数组里：

```ts
parseHTML() {
  return [{ tag: "action" }, { tag: "scene" }];
}
```

旧 `<scene-heading>` 纯文本格式由 sceneHeading 的 `parseHTML.getAttrs` 兜底。

---

## 二、气泡菜单系统

### 2.1 控制器（PluginKey）

`extensions/script-menu-controller.ts`：

```ts
type ScriptMenuName = "location" | "time" | "intExt" | "character" | "transition";
interface ScriptMenuState {
  open: ScriptMenuName | null;
  pos: number | null;        // 节点位置
  openedFor: number | null;  // 防止节点位置不变时重复 open
}

editor.commands.openScriptMenu(name, { pos })
editor.commands.closeScriptMenu()
```

通过 transaction meta 派发 `open` / `switch` / `close`。React 端用 `useEditorState` 订阅。

### 2.2 通用 Shell

`script-menus/shell.tsx`：

* `useFloating({ placement: "bottom-start", middleware: [offset(8), flip, shift] })`，参考已有 slash-command 的虚拟 reference 思路。
* 锚点：通过 `editor.view.nodeDOM(pos)` 取根节点，再 `querySelector('[data-script-chip="..."]')` 找 chip；character / transition 锚到节点本身。
* 统一处理 `Escape`、外部 pointerdown、Tab 拦截。

`use-list-navigation.ts`：纯逻辑 hook，输入 items + 初始 index，输出 activeIndex 与 keydown 处理。

### 2.3 各菜单实现要点

| 菜单 | 触发 | 数据 | 选择动作 |
| --- | --- | --- | --- |
| Location_Menu | 点 location chip / 斜杠插入 sceneHeading 后自动 | 文档内 sceneHeading.location 去重 | `updateAttributes` + close；Tab → 切到 Time_Menu；空匹配显示"创建 xxx" |
| Time_Menu | 点 time chip / Location 后 Tab | 固定 `["日","夜","午","晨","暮","接续","稍后","片刻后","同时"]` | `updateAttributes` + close |
| IntExt_Menu | 点 intExt chip | 固定 `["内","外","内/外","外/内"]` | `updateAttributes` + close |
| Character_Menu | 进入空 character 节点 / 斜杠 / 点击 character 节点 | 文档内 character 节点 textContent 去重 | 写文本到节点 → split → 切 dialogue；空匹配显示"创建 xxx" |
| Transition_Menu | 进入 transition 节点（点击或斜杠） | 固定 8 项 | 写文本到节点；允许用户继续手动编辑 |

需求 R12 通过 Shell 统一满足：

* R12.1 Esc 关闭：Shell `keydown` capture；
* R12.2 外部点击关闭：Shell 在 floating 元素外 `pointerdown` 派发 close meta；
* R12.3 不超出视口：`flip` + `shift` middleware。

### 2.4 防重复弹出

控制器中存 `openedFor: nodePos`，节点位置不变就不重复 open；只有节点切换或 close 后才允许下一次自动 open。这是 character / transition "进入即弹"的关键。

---

## 三、斜杠命令与块选择菜单

### 3.1 `slash-command/commands.ts`

`script` 段保留 7 项，删除 `scene`：

```
sceneHeading / action / character / dialogue / transition / note / subtitle
```

`runSlashCommand` 内的扩展：

* 选 `sceneHeading` → `setNode("sceneHeading", { location:"", time:"", intExt:"" })` + `openScriptMenu("location", { pos })`；
* 选 `character` → `setNode + openScriptMenu("character")`；
* 选 `transition` → `setNode + openScriptMenu("transition")`；
* 其它三项仅 setNode。

### 3.2 `bubble-menu/bubble-menu-config.ts`

移除 `scene`，新增 `transition` / `note` / `subtitle`，图标分别用 `MoveRight` / `StickyNote` / `Captions`。其余条目保留。

---

## 四、AI 选区处理

`features/agent-editor/services/editor-ai-context.ts` 重写：

```ts
const STRUCTURAL_NODE_NAMES = new Set([
  "sceneHeading",   // atom
  "character",
  "transition",
]);

function expandRangeToStructuralNodes(state, from, to) {
  let nextFrom = from;
  let nextTo = to;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!STRUCTURAL_NODE_NAMES.has(node.type.name)) return true;
    nextFrom = Math.min(nextFrom, pos);
    nextTo = Math.max(nextTo, pos + node.nodeSize);
    return false;
  });
  return { from: nextFrom, to: nextTo };
}

export function createEditorAIRequest(editor, message) {
  const base = getAISelectionRange(editor.state) ?? editor.state.selection;
  if (!base || base.from >= base.to) return null;

  const { from, to } = expandRangeToStructuralNodes(editor.state, base.from, base.to);
  const oldText = editor.state.doc.textBetween(from, to, "\n\n");
  if (!oldText.trim()) return null;

  // 插入 selection 边界节点用于序列化（沿用现有逻辑）
  const tr = editor.state.tr
    .insert(to, endBoundary.create())
    .insert(from, startBoundary.create());

  return {
    requestId: nanoid(),
    message,
    selection: {
      contentWithSelection: serializeDocContent(tr.doc),
      oldText,
    },
  };
}
```

要点：

* 不再生成 `EditorAIPendingSnapshot`、不再注册 `editorAIPendingRegistry`；
* 选区在前端就被规整到结构化节点边界外，AI 看到的永远是完整节点；
* `oldText` 同时返回，方便服务端 prompt 拼接，避免重复解析 HTML。

BubbleMenu 端的高亮维持现状，不做选区扩展（按你的意见）。

---

## 五、Tool Call 协议：`propose_edits`

### 5.1 类型定义（`features/agent-editor/services/propose-edits-schema.ts`）

```ts
export type ProposeEditsArgs = {
  summary: string;
  edits: Edit[];
};

export type Edit = {
  id: string;
  rationale?: string;
  anchor: Anchor;
  operation: Operation;
};

export type Anchor =
  | {
      kind: "text-range";
      oldText: string;
      before?: string;   // ~20 字符上下文
      after?: string;
    }
  | {
      kind: "node";
      nodeType: ScriptNodeType;
      matchText?: string;
      matchAttrs?: Record<string, unknown>;
      occurrence?: number; // 同 matchAttrs 多次命中时的序号，从 0 起
    }
  | {
      kind: "between-nodes";
      afterMatchText: string;
    };

export type Operation =
  | { kind: "replace-text"; alternatives: TextAlternative[] }
  | { kind: "update-node-attrs"; alternatives: AttrsAlternative[] }
  | { kind: "replace-nodes"; alternatives: NodesAlternative[] }
  | { kind: "insert-nodes"; nodes: NodeJSON[] }
  | { kind: "delete" };

export type TextAlternative  = { id: string; label?: string; newText: string };
export type AttrsAlternative = { id: string; label?: string; attrs: Record<string, unknown> };
export type NodesAlternative = { id: string; label?: string; nodes: NodeJSON[] };

export type ScriptNodeType =
  | "sceneHeading" | "action" | "character"
  | "dialogue"     | "transition" | "note" | "subtitle";

export type NodeJSON = { type: ScriptNodeType; attrs?: Record<string, unknown>; content?: NodeJSON[] | { type: "text"; text: string }[] };
```

`alternatives` 数组承载"一处位置的多个候选"，长度 1 即单一改写。

### 5.2 服务端注册

服务端通过 ai-sdk v6 注册 `propose_edits` tool（zod schema 镜像上面的 TS 类型），系统 prompt 明确：

* 任何对剧本的修改建议都必须通过 `propose_edits` 工具返回；
* 普通文本回复用于解释、追问、不需要改写时；
* 每条 edit 必须给出 anchor，`text-range` 锚点要附带 `before` / `after` 上下文（除非全文唯一）；
* 多候选时按"主推 → 备选"排序，至多 3 个。

### 5.3 Anchor 解析（`anchor-resolver.ts`）

```ts
export type ResolvedAnchor =
  | { kind: "range"; from: number; to: number }
  | { kind: "node"; from: number; to: number; nodeType: string }
  | { kind: "insert"; pos: number };

export type ResolveResult =
  | { ok: true; resolved: ResolvedAnchor }
  | { ok: false; reason: "not-found" | "ambiguous" | "stale" };

export function resolveAnchor(editor: Editor, anchor: Anchor): ResolveResult;
```

实现要点：

* `text-range`：用 `doc.textBetween` 全文搜 oldText；多于 1 处时用 before/after 前后缀验证；仍歧义返回 `ambiguous`。
* `node`：遍历 `doc.descendants` 匹配 nodeType + matchText / matchAttrs；按 occurrence 取目标。
* `between-nodes`：找到 `afterMatchText` 所在 textblock 的 nodeAfter 位置作为插入点。

---

## 六、Edit 应用与撤销

`edit-applier.ts`：

```ts
export interface AppliedSnapshot {
  editId: string;
  alternativeId: string;
  prevSlice: { from: number; to: number; jsonContent: NodeJSON[] };
  appliedRange: { from: number; to: number };
}

export function applyEdit(editor, edit, alternativeId): AppliedSnapshot | null;
export function undoEdit(editor, snapshot: AppliedSnapshot): boolean;
```

应用规则：

* `replace-text`：解析 anchor 得 `{ from, to }` → `chain().insertContentAt({ from, to }, alternative.newText, { updateSelection: false }).run()`；
* `update-node-attrs`：`updateAttributes(nodeType, attrs)` 在解析得到的节点位置执行；
* `replace-nodes`：将 alternative.nodes 转为 ProseMirror Slice，`tr.replaceWith(from, to, fragment)`；
* `insert-nodes`：在 `pos` 处插入；
* `delete`：`tr.delete(from, to)`。

撤销：用 `prevSlice` 的 JSON 还原原片段，再写回；不依赖全局 undo，避免串台。

批量应用顺序：从文档末尾向前 apply，避免位置漂移。

---

## 七、卡片状态机与 Store

`edits-store.ts`（zustand）：

```ts
type EditState = "pending" | "applied" | "rejected" | "stale" | "superseded";

interface EditEntry {
  edit: Edit;
  state: EditState;
  appliedAlternativeId?: string;
  appliedSnapshot?: AppliedSnapshot;
  resolveError?: string;
}

interface EditsStore {
  entries: Record<string, EditEntry>;     // editId → entry
  groups: Array<{ requestId: string; editIds: string[]; summary: string }>;

  ingestToolCall(requestId, args: ProposeEditsArgs): void;
  setState(editId, state, payload?): void;
  apply(editor, editId, alternativeId): void;
  undo(editor, editId): void;
  applyAll(editor, requestId): void;
  rejectAll(editor, requestId): void;
  refreshResolution(editor): void;        // 文档变化后重新解析所有 pending
}
```

文档变化（编辑器 `update` 事件）触发 `refreshResolution`，把无法解析的 pending edit 标记为 `stale` / `superseded`。已应用的 entry 不重新解析，但用户编辑了它的 appliedRange 后标 `superseded`，禁用撤销（避免反向 patch 把用户改动覆盖）。

---

## 八、卡片 UI

### 8.1 卡片组容器 `ai-edits-cards.tsx`

挂在聊天面板里 ai-sdk 的 `tool-invocation` part 渲染处。每收到一次 `propose_edits` 工具调用，往 store 增量插入一个 group；卡片组顶部包含：

* 标题 = `summary`
* 进度条 = `已应用 X / N`
* 操作 = `[全部应用] [全部拒绝] [仅查看未应用]`
* 列表 = `EditCard[]`

### 8.2 单卡片 `ai-edit-card.tsx`

布局：

```
┌────────────────────────────────────────────┐
│ ✏️ {operation 标题} · {锚点摘要}           │
│ {rationale}                                │
├────────────────────────────────────────────┤
│ Original                                   │
│ ▸ {oldText 预览}                           │
├────────────────────────────────────────────┤
│ ◉ 选项 1 · {label}                         │
│   {alternative 预览}                       │
│ ○ 选项 2 · {label}                         │
│   ...                                      │
├────────────────────────────────────────────┤
│ 状态徽章        [📍] [拒绝] [应用所选 ✓]   │
└────────────────────────────────────────────┘
```

* `replace-text` / `replace-nodes`：渲染 Original + alternatives 文本预览；
* `update-node-attrs`：渲染 attrs 差异表（`时间: 午 → 暮`）；
* `insert-nodes`：只显示 alternatives 内容预览，标"新增"；
* `delete`：显示 oldText，标"删除"，无 alternatives。

候选切换：

* radio 切换 alternative；
* hover 候选时 → 编辑器内目标 anchor 显示 ghost preview（用 `pendingEditsHighlight` 插件画一个浅色 background + dashed outline 的 inline Decoration）；
* 应用后卡片折叠为一行：`✓ 已应用：选项 1 — {预览}`，右侧 `[使用其他选项 ▾] [撤销]`。

锚点摘要由前端按 `Anchor` 类型生成（如 `场次 2 · 对话` / `场次 2 · 场次行`）。

### 8.3 编辑器 indicator

`extensions/pending-edits-highlight.ts`：

* 插件 state 通过 zustand subscribe → `view.dispatch(tr.setMeta(...))`，避免 React 与 ProseMirror 双向打架；
* `decorations` 中按 entry 状态生成左侧 indicator：
  * pending → 浅蓝竖条
  * applied → 浅绿竖条
  * stale / superseded → 灰色 + 虚线
* hover 卡片 → 对应竖条加粗 + scrollIntoView；hover 竖条 → 卡片 highlight + 滚到视口（双向通过 store 暴露 `focusedEditId`）。

---

## 九、典型流程

### 9.1 用户划词 → 卡片改写

1. 用户在编辑器里划词，BubbleMenu 出现。
2. 点 AI 按钮，写指令 `让小芸的语气更俏皮`。
3. 前端 `createEditorAIRequest` 走 `expandRangeToStructuralNodes`，把选区扩到结构化节点边界外，发请求体 `{ requestId, message, selection: { contentWithSelection, oldText } }`。
4. 服务端调用 `propose_edits` 工具返回。
5. 聊天面板渲染卡片组，每张卡片 anchor 解析成功后亮起 indicator。
6. 用户切换候选 → 编辑器对应位置 ghost preview。
7. 点击 `应用所选` → `applyEdit` → 文档真正更新，卡片折叠，indicator 变绿。
8. 用户反悔 → 点 `撤销` → `undoEdit` 用 `prevSlice` 还原。

### 9.2 多处更新

服务端在一次 `propose_edits` 里返回 N 个 edit。卡片组按 entry 列出，文档侧 indicator 全部画出来。用户可逐张操作，也可点 `全部应用` 一次性按"末尾→开头"顺序应用。

### 9.3 一处多候选

`alternatives` 长度 ≥ 2 即在卡片内显示 radio。切换候选只改 `selectedAlternativeId`，不会触发实际编辑；只有点 `应用所选` 才真正改文档。已应用后切换需先撤销再应用新候选（`使用其他选项 ▾` 按钮内部就是"undo + apply 新 alt" 两步）。

### 9.4 SceneHeading 的 attrs 改写

LLM 返回示例：

```json
{
  "id": "edit-2",
  "anchor": { "kind": "node", "nodeType": "sceneHeading", "matchAttrs": { "location": "公园", "time": "午", "intExt": "外" } },
  "operation": {
    "kind": "update-node-attrs",
    "alternatives": [
      { "id": "a", "label": "暮", "attrs": { "time": "暮" } },
      { "id": "b", "label": "夜", "attrs": { "time": "夜" } }
    ]
  }
}
```

卡片显示 `时间: 午 → 暮`（按 attrs diff 渲染），应用即 `editor.chain().updateAttributes("sceneHeading", { time: "暮" })`。这是 inline diff 完全做不到的能力。

---

## 十、需求映射速查

| 需求 | 实现位置 |
| --- | --- |
| R1.1 / 1.5 | `scene-heading.tsx` ReactNodeView |
| R1.2 / 1.4 | `sequence-number-plugin.ts` Decoration |
| R1.3 | atom 节点 + `contentEditable={false}` |
| R2.* | `script-menus/location-menu.tsx` |
| R3.* | `script-menus/time-menu.tsx` |
| R4.* | `script-menus/int-ext-menu.tsx` |
| R5.* | `extensions/script-nodes/action.ts`（合并 scene） |
| R6.* | `script-menus/character-menu.tsx` + character 节点切换钩子 |
| R7.* | `extensions/script-nodes/dialogue.ts` |
| R8.* | `transition.ts` + `transition-menu.tsx` + CSS 右对齐 |
| R9 | `note.ts` + CSS blockquote 风格 |
| R10 | `subtitle.ts` + CSS 加粗斜体 + padding-left:32px |
| R11.1 | `slash-command/commands.ts` 七项 |
| R11.2 | 移除 `scene` 节点及引用 |
| R11.3 | `sceneHeading` 的 Enter 节点选中态 keymap |
| R12.* | `script-menus/shell.tsx` |

---

## 十一、迁移 / 实施 Roadmap

按"小步、可独立验证"的顺序：

**Phase 1 — 节点骨架（最小破坏）**

* 拆分 `script-nodes/` 目录；
* 删除 `Scene` 扩展并清理 `editor.tsx`、`bubble-menu-config`、`slash-command/commands` 的引用；
* 新增 action（合并 Scene）、transition、note、subtitle 四个简单节点 + 流转 keymap；
* 更新 `DEFAULT_EDITOR_CONTENT`、`editor.css`；
* 验证：斜杠菜单可插入七种节点（sceneHeading 暂时显示纯文本占位）；视觉满足 R8.1 / R9 / R10。

**Phase 2 — SceneHeading 结构化节点**

* `sceneHeading` 改 atom + 三 attrs + ReactNodeView；
* 加 `sequence-number-plugin`；
* parseHTML 兼容旧文本格式；
* 验证：插入、删除、移动后序号自动续；旧文档可正常加载。

**Phase 3 — 气泡菜单基础设施**

* `script-menu-controller`、`script-menus/shell.tsx`、`use-list-navigation`；
* 验证：手动 `editor.commands.openScriptMenu("time", { pos })` 能弹空菜单，Esc / 外点关闭。

**Phase 4 — Time / IntExt 菜单**

* 固定列表，写回 attrs；点击 chip 即弹。

**Phase 5 — Location 菜单**

* 收集已有 location、搜索、创建项、Tab 串联到 Time。

**Phase 6 — Character 菜单**

* 节点切换钩子触发 open；选择后 split 到 dialogue。

**Phase 7 — Transition 菜单**

* 进入节点自动弹；写文本。

**Phase 8 — AI 选区扩展**

* 重写 `editor-ai-context.ts` 的 `createEditorAIRequest`；
* 删除 `editorAIPendingRegistry` / `applyEditorAIPatch` / `EditorAIPendingSnapshot`；
* 服务端 `extractSelectionText` 同步移除（被 ToolCall 替代）。

**Phase 9 — Tool Call 基础设施**

* `propose-edits-schema.ts`、`anchor-resolver.ts`、`edit-applier.ts`、`edits-store.ts`；
* 服务端注册 `propose_edits` tool；
* 不接 UI，单元测试 + 手测 e2e（控制台 dispatch 验证 apply / undo）。

**Phase 10 — 卡片 UI**

* `ai-edits-cards.tsx` + `ai-edit-card.tsx`，先支持 `replace-text` 单候选；
* 在 chat panel 集成 ai-sdk `tool-invocation` part 渲染。

**Phase 11 — 多候选 + 多卡片 + indicator**

* alternatives radio + ghost preview；
* `pending-edits-highlight.ts` 插件 + 双向滚动定位；
* `[全部应用] / [全部拒绝]`。

**Phase 12 — 结构化操作扩展**

* `update-node-attrs` / `replace-nodes` / `insert-nodes` / `delete`；
* 卡片渲染 attrs diff；
* SceneHeading attrs 改写场景跑通。

**Phase 13 — DiffBlock 下线**

* 移除 `extensions/diff-block.tsx`；
* 清理 `use-stream-writer.ts` 中 AI 改写相关分支（如有其他流式场景需求则保留通用部分）；
* 清理 `server/chat/editor-ai-protocol.ts` 中 patch / extractSelectionText 逻辑；
* 删除关联测试或迁移到新协议测试。

**Phase 14 — Prompt 与文档收尾**

* 更新 `features/rich-editor/README.md`、`features/agent-editor/README.md`；
* 服务端 prompt 强约束 `propose_edits` 工具调用规范；
* 关键回归测试：选区扩展、anchor 解析（含跨场次）、apply / undo 顺序、stale 检测。

---

## 十二、关键风险清单

| 风险 | 对策 |
| --- | --- |
| atom 节点 NodeView 内 chip 点击丢焦 | chip `onMouseDown={e => e.preventDefault()}`，再手动 dispatch open meta |
| 自动弹菜单（character / transition）反复打开 | 控制器记 `openedFor: pos`，节点位置不变就不重复 open |
| Tab 在浏览器默认换焦点 | Shell 在 capture 阶段 `preventDefault` |
| 序号 Decoration 与 collab/undo 冲突 | 装饰为派生数据，不写回 doc，不进 history |
| anchor `text-range` 全文歧义 | LLM prompt 强制要求 before/after 上下文；前端歧义时给卡片 `stale` 状态 |
| 用户在 pending 期间编辑文档 | 编辑器 update 事件触发 `refreshResolution`；卡片标 stale，禁用应用 |
| 一次性"全部应用"位置漂移 | 按 from 倒序应用 |
| 已应用 entry 之上又编辑 | 标 `superseded`，禁用撤销 |
| LLM 输出非法 JSON / 缺字段 | propose-edits-schema 用 zod 校验 + 服务端拦截重试 |
| 旧文档 `<scene>` 兼容 | sceneHeading parseHTML.getAttrs 兜底 + action.parseHTML 接 `<scene>` |

---

## 十三、对外契约（最重要的不变量）

* 编辑器对外暴露的 `getJSON()` / `getHTML()` 用新 schema；序列化结果稳定，可作为存储格式。
* 服务端可消费的两个入口：
  * 请求体 `{ requestId, message, selection: { contentWithSelection, oldText } }`；
  * 响应通过 `propose_edits` 工具返回 `ProposeEditsArgs`。
* 前端单卡片状态机：`pending → applied / rejected / stale / superseded`，applied 可 `undo` 回到 `pending`。
* SceneHeading 永远不进入文本 diff 流程；其结构化变更走 `update-node-attrs`。

---

按这个方案落地，可以先在新会话里冻结三个文件作为协议合同：`propose-edits-schema.ts`、`anchor-resolver.ts` 接口、`edits-store.ts` 接口。剩下的 13 个 Phase 都可以在不破坏这三个合同的前提下并行推进。