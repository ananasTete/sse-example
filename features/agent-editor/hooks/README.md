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

## 剧本编辑器序列化方案

### 背景

编辑器面向剧本创作场景，采用台湾影视剧本的标准写作格式。文档由有限的、语义化的节点类型组成，每种格式通过 Tiptap 自定义节点实现。不需要通用富文本能力（无表格、引用、嵌套列表等），但需要保留节点类型信息以便 AI 理解文档结构，且反序列化时能无歧义地还原每个节点类型。

### 剧本写作格式规范

| 元素 | 格式规则 | 说明 |
|------|---------|------|
| 场次标题 | **粗体**，格式：`编号. 内景/外景 地点 时间 人物` | 时间可为日/夜/晨/昏；跨内外用「内/外景」；该场出现人物皆须列出 |
| 场景描写 | 前加 `△` 符号（CSS 渲染，非用户内容） | 通常在场次标题之后，交代场景画面 |
| 动作描写 | 前加 `△` 符号（CSS 渲染，非用户内容） | 描述人物的具体动作行为 |
| 对白 | 角色名置中 + 冒号，对白写于下一行置中，前后各空一行 | — |
| 场次切换 | 新场次前空两行，编上场次编号 | — |

### 格式示例

```
1. 內景 教室 白天 小芸、阿良

△一間寬敞明亮的教室，窗外陽光灑進來，照在學生的臉上。
△小芸坐在窗邊，一邊寫著筆記，一邊偷看同學阿良。

小芸：
你昨天有唸書嗎？

阿良：
沒有耶，我昨天打電動到半夜……

△小芸翻了個白眼，繼續低頭寫筆記。
△阿良趁機把手機藏在課本後面，繼續玩著手遊。


2. 外景 公園 下午 小芸、阿良

△陽光透過樹葉灑在長椅上，風吹過來帶著微微的涼意。
△小芸坐在長椅上吃著冰淇淋，表情放鬆。
△阿良慢慢走近，手上拿著兩瓶飲料。

阿良：
你怎麼一個人跑來公園？

小芸：
想一個人靜靜，結果還是被你找到了。

△兩人相視而笑，氣氛輕鬆。
```

> 注意：场景描写和动作描写在编辑器中显示 `△` 前缀（通过 CSS `::before` 伪元素），用户不可编辑/删除。区别在于语义：场景描写交代环境，动作描写交代人物行为。在编辑器中通过不同节点类型区分，导出 HTML 时不包含 `△`。

### 节点类型与自定义节点实现

每种格式元素对应一个 Tiptap 自定义 Node，通过 `Node.create()` 定义：

| 节点类型 | 英文标识 | 样式 | 说明 | 自定义节点名 |
|---------|---------|------|------|------------|
| 场次标题 | scene_heading | 左对齐、粗体 | 格式：`编号. 内/外景 地点 时间 人物` | `sceneHeading` |
| 场景描写 | scene | 左对齐 | 环境/氛围描述，显示 `△` 前缀（CSS） | `scene` |
| 动作描写 | action | 左对齐 | 人物动作行为，显示 `△` 前缀（CSS） | `action` |
| 角色名 | character | 居中 | 说话人名称，回车进入对白前自动补 `:` | `character` |
| 对白 | dialogue | 居中 | 角色的台词 | `dialogue` |
| 通用文本 | text | 左对齐 | 不属于以上类型的段落 | `paragraph` |

#### 回车键行为（节点自动切换）

| 当前节点 | 回车后进入 | 说明 |
|---------|-----------|------|
| `sceneHeading` | `scene` | 场次标题后自然进入场景描写 |
| `scene` | `action` | 场景描写后自然进入动作描写 |
| `action` | `action` | 连续动作描写 |
| `character` | `dialogue` | 角色名后自动补 `:`，并自然进入对白 |
| `dialogue` | `action` | 对白结束后回到动作描写 |

### 自定义节点实现方案

```typescript
import { Node, mergeAttributes } from "@tiptap/core";

// 场次标题节点
export const SceneHeading = Node.create({
  name: "sceneHeading",
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      number: { default: 1 },
      location: { default: "內景" },
      place: { default: "" },
      time: { default: "白天" },
      characters: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "scene-heading" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "scene-heading",
      mergeAttributes(HTMLAttributes, {
        style: "font-weight: bold;",
      }),
      0,
    ];
  },

  // 回车 → 进入 scene 节点
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!this.editor.isActive("sceneHeading")) return false;
        return editor.chain().splitBlock().setNode("scene").run();
      },
    };
  },
});

// 场景描写节点（环境/氛围描述）
// CSS: scene::before { content: "△"; }
export const Scene = Node.create({
  name: "scene",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "scene" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "scene",
      mergeAttributes(HTMLAttributes),
      0,
    ];
  },

  // 回车 → 进入 action 节点
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!this.editor.isActive("scene")) return false;
        return editor.chain().splitBlock().setNode("action").run();
      },
    };
  },
});

// 动作描写节点（人物行为）
// CSS: action::before { content: "△"; }
export const Action = Node.create({
  name: "action",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "action" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "action",
      mergeAttributes(HTMLAttributes),
      0,
    ];
  },
});

// 角色名节点
export const Character = Node.create({
  name: "character",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "character" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "character",
      mergeAttributes(HTMLAttributes, {
        style: "text-align: center;",
      }),
      0,
    ];
  },

  // 回车 → 进入 dialogue 节点
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!this.editor.isActive("character")) return false;
        return editor.chain().splitBlock().setNode("dialogue").run();
      },
    };
  },
});

// 对白节点
export const Dialogue = Node.create({
  name: "dialogue",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "dialogue" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dialogue",
      mergeAttributes(HTMLAttributes, {
        style: "text-align: center;",
      }),
      0,
    ];
  },

  // 回车 → 回到 action 节点
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (!this.editor.isActive("dialogue")) return false;
        return editor.chain().splitBlock().setNode("action").run();
      },
    };
  },
});
```

### 序列化格式（HTML 标签方案）

**方案选择**：采用小写语义化 HTML 自定义标签，直接利用 Tiptap 的 `renderHTML` / `parseHTML` 机制。剧本节点扩展注册完成后，序列化可复用 `editor.getHTML()` / `DOMSerializer`，反序列化可复用 `editor.commands.setContent(html)`。

每个节点的 `renderHTML` 输出对应的自定义标签：

```typescript
// Scene 节点
renderHTML({ HTMLAttributes }) {
  return ["scene", mergeAttributes(HTMLAttributes), 0];
}
parseHTML() {
  return [{ tag: "scene" }];
}

// Action 节点
renderHTML({ HTMLAttributes }) {
  return ["action", mergeAttributes(HTMLAttributes), 0];
}
parseHTML() {
  return [{ tag: "action" }];
}

// Character 节点
renderHTML({ HTMLAttributes }) {
  return ["character", mergeAttributes(HTMLAttributes), 0];
}
parseHTML() {
  return [{ tag: "character" }];
}

// Dialogue 节点
renderHTML({ HTMLAttributes }) {
  return ["dialogue", mergeAttributes(HTMLAttributes), 0];
}
parseHTML() {
  return [{ tag: "dialogue" }];
}

// SceneHeading 节点
renderHTML({ HTMLAttributes }) {
  return ["scene-heading", mergeAttributes(HTMLAttributes), 0];
}
parseHTML() {
  return [{ tag: "scene-heading" }];
}
```

#### 序列化输出示例

```html
<scene-heading>1. 內景 教室 白天 小芸、阿良</scene-heading>
<scene>一間寬敞明亮的教室，窗外陽光灑進來，照在學生的臉上。</scene>
<action>小芸坐在窗邊，一邊寫著筆記，一邊偷看同學阿良。</action>
<character>小芸:</character>
<dialogue>你昨天有唸書嗎？</dialogue>
<character>阿良:</character>
<dialogue>沒有耶，我昨天打電動到半夜……</dialogue>
<action>小芸翻了個白眼，繼續低頭寫筆記。</action>
<action>阿良趁機把手機藏在課本後面，繼續玩著手遊。</action>
<scene-heading>2. 外景 公園 下午 小芸、阿良</scene-heading>
<scene>陽光透過樹葉灑在長椅上，風吹過來帶著微微的涼意。</scene>
<action>小芸坐在長椅上吃著冰淇淋，表情放鬆。</action>
<action>阿良慢慢走近，手上拿著兩瓶飲料。</action>
<character>阿良:</character>
<dialogue>你怎麼一個人跑來公園？</dialogue>
<character>小芸:</character>
<dialogue>想一個人靜靜，結果還是被你找到了。</dialogue>
<action>兩人相視而笑，氣氛輕鬆。</action>
```

#### 为什么选 HTML 标签方案？

| 维度 | `[type] content` 自定义标记 | `<scene-heading>content</scene-heading>` HTML 标签 |
|------|---------------------------|--------------------------------|
| 序列化 | 手写遍历 doc 拼字符串 | 剧本节点注册后复用 `editor.getHTML()` / `DOMSerializer` |
| 反序列化 | 手写正则解析回节点 | 剧本节点注册后复用 `editor.commands.setContent(html)` |
| 开发成本 | 高 — 两套代码要写要维护 | 自定义节点负责 HTML 映射，业务层复用 Tiptap 能力 |
| 选区标记 | 在纯文本上插标记再拼前缀 | **inline atom 节点，DOMSerializer 自动输出** |
| AI 理解 | 好 | 同样好 — AI 对 HTML 标签很熟悉 |
| Token 开销 | 较少 | 略多（闭合标签），可接受 |
| 扩展性 | 不方便加属性 | 天然支持（`<scene-heading number="1">`) |
| 边界情况 | 内容含 `[` 需转义、多行内容需处理 | 无此问题 |

### 选区标记插入

复用项目现有方案：

1. **`SelectionStartBoundary` / `SelectionEndBoundary`** — 已有的 inline atom 节点扩展
2. 在选区位置插入这两个标记节点到文档中
3. 通过 `DOMSerializer.fromSchema` 将整个文档（含标记节点）序列化为 HTML
4. 输出纯 HTML 格式

```typescript
function serializeWithSelection(editor: Editor, from: number, to: number): string {
  const { state } = editor;
  const { doc, schema } = state;

  // 1. 在选区位置插入标记节点（不修改编辑器状态）
  let tr = state.tr;
  tr.insert(to, schema.nodes.selectionEndBoundary.create());
  tr.insert(from, schema.nodes.selectionStartBoundary.create());

  // 2. 用 DOMSerializer 导出 HTML
  const serializer = DOMSerializer.fromSchema(schema);
  const fragment = serializer.serializeFragment(tr.doc.content);

  // 3. 转为 HTML 字符串
  const div = document.createElement("div");
  div.appendChild(fragment);
  return div.innerHTML;
}
```

#### 带选区标记的输出示例

```html
<character>小芸:</character>
<dialogue>你昨天有<selection-start></selection-start>唸書嗎？</dialogue>
<action>小芸翻了個白眼，繼續低頭<selection-end></selection-end>寫筆記。</action>
```

选中整个节点时：

```html
<character>小芸:</character>
<dialogue><selection-start></selection-start>你昨天有唸書嗎？<selection-end></selection-end></dialogue>
```

标记节点作为 inline atom 自然出现在正确位置，无需手动计算偏移。

### 当前阶段 vs 未来

| 阶段 | 方案 | 说明 |
|------|------|------|
| 当前 | 纯文本 + `SelectionStartBoundary` / `SelectionEndBoundary` | 剧本 node schema 未定义前，先用纯文本跑通流程 |
| 下一步 | 实现自定义节点 | 定义 `sceneHeading` / `scene` / `action` / `character` / `dialogue` 五个核心节点 + 回车键行为 + 语义化 HTML 标签 renderHTML |
| 最终 | 直接用 `DOMSerializer` + 现有选区标记方案 | 节点稳定并注册后，`getHTML()` 作为序列化结果，`setContent(html)` 负责反序列化 |

切换时只需替换 `buildSelectionReference` 内部的序列化实现，接口不变。
