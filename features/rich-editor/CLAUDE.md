# Rich Editor

基于 [Tiptap](https://tiptap.dev/) 构建的富文本编辑器，支持 AI 划词交互、流式内容写入和段落级 Diff 审阅。

## 目录结构

```
features/rich-editor/
├── editor.tsx                  # 主组件，注册所有扩展，组合 BubbleMenu 和 SlashCommandMenu
├── editor.css                  # 编辑器全局样式（ProseMirror、BubbleMenu、Diff Block）
├── index.tsx                   # 公开导出（re-export editor.tsx）
├── extensions/
│   ├── ai-selection-highlight.ts   # 自定义选区高亮插件（AI 面板打开时保持高亮）
│   ├── ai-selection-boundary.ts    # 选区边界节点（序列化 HTML 时标记选区位置）
│   ├── diff-block.tsx              # 段落级 Diff 节点 + DiffChange mark（接受/拒绝修改）
│   ├── slash-command.ts            # Slash 命令触发插件（ProseMirror Plugin）
│   └── underline.ts                # 本地实现的 Underline mark
├── bubble-menu/
│   ├── index.tsx                   # BubbleMenu 顶层组件（format 工具栏 + AI 面板切换）
│   ├── bubble-menu-config.ts       # nodeTypes 配置（段落、标题、列表等）
│   ├── bubble-menu.css             # BubbleMenu 及浮层样式
│   ├── components/
│   │   ├── ai-button.tsx           # AI 触发按钮
│   │   ├── ai-floating-panel.tsx   # 独立定位的 AI 输入面板
│   │   ├── format-buttons.tsx      # Bold / Italic / Strike / Underline 按钮
│   │   ├── more-menu.tsx           # 更多操作下拉（复制、删除）
│   │   ├── floating-menu-layer.tsx # 浮层通用容器（Portal + 遮罩 + FocusManager）
│   │   ├── node-type-select.tsx    # 节点类型切换下拉（未在主菜单中使用，保留备用）
│   │   ├── align-select.tsx        # 对齐方式下拉（未在主菜单中使用，保留备用）
│   │   ├── color-select.tsx        # 字体/背景颜色下拉（未在主菜单中使用，保留备用）
│   │   ├── delete-block-button.tsx # 删除块按钮
│   │   └── divider.tsx             # 分隔线
│   └── hooks/
│       └── use-floating-select.ts  # 浮层下拉通用 hook（Floating UI 封装）
├── slash-command/
│   ├── commands.ts                 # Slash 菜单数据模型（分区、命令、过滤逻辑）
│   ├── index.tsx                   # SlashCommandMenu React 组件（键盘导航、定位）
│   └── slash-command.css           # Slash 菜单样式
└── hooks/
    └── use-stream-writer.ts        # 流式 HTML 写入 hook（RAF 节流、简单块预览）
```

## 当前启用的扩展

编辑器只支持文本节点，不包含剧本节点（SceneHeading、Scene、Action、Character、Dialogue）。

| 扩展 | 来源 | 说明 |
|------|------|------|
| `StarterKit` | @tiptap/starter-kit | 段落、标题、列表、代码块、引用、Bold、Italic、Strike、Code 等基础扩展 |
| `Underline` | 本地实现 | Underline mark |
| `SlashCommand` | 本地实现 | `/` 触发命令菜单的 ProseMirror 插件 |
| `AISelectionHighlight` | 本地实现 | AI 面板打开时保持选区高亮的装饰器插件 |
| `SelectionStartBoundary` / `SelectionEndBoundary` | 本地实现 | 序列化 HTML 时标记选区边界的 inline atom 节点 |
| `DiffChange` | 本地实现 | inline mark，标记 added / removed 文本 |
| `DiffBlock` | 本地实现 | block 节点，包裹 Diff 内容，提供接受/拒绝操作 |

**未启用**（已移除）：`TextAlign`、`TextStyle`、`Color`、`Highlight`、剧本节点。

## BubbleMenu 结构

划词后显示，包含：

```
[AI] | [Bold] [Italic] [Strike] [Underline] | [More]
```

- 点击 AI 按钮后，format 工具栏隐藏，切换为独立定位的 `AIFloatingPanel`
- `AIFloatingPanel` 通过 `AISelectionHighlightPluginKey` 读取选区坐标，使用 Floating UI `autoUpdate` 跟随滚动
- 二级浮层（`FloatingMenuLayer`）通过 `FloatingPortal` 挂载到 body，并渲染透明遮罩拦截外部点击和滚动

**已移除**：NodeTypeSelect（节点切换）、AlignSelect（对齐方式）、ColorSelect（字体/背景颜色）。

## Slash 命令菜单

输入 `/` 触发，当前包含两个分区：

- **Basic**：Text、Heading 1–3、Other Heading（子菜单含 H4–H6）、Bulleted list、Numbered list、Code block、Quote
- **Style**：Bold、Italic、Underline、Strikethrough

**已移除**：Script 分区（剧本节点）、Align 分区（对齐）、Inline Code。

## 关键约定

### 状态更新必须通过 Transaction

任何对编辑器内容或插件状态的修改都必须通过 `dispatch(tr)` 完成，不能直接修改 state。插件内部状态通过 `tr.setMeta(pluginKey, meta)` 驱动更新。

### useEditorState 用于响应式订阅

编辑器内部状态变化不触发 React 重渲染，需要用 `useEditorState` 订阅。BubbleMenu 采用单点订阅模式，避免多个组件各自订阅带来的性能开销。

### AI 面板定位原理

1. 点击 AI 按钮 → 调用 `setAISelectionHighlight(from, to)` 写入插件状态
2. `AIFloatingPanel` 从插件状态读取 `{ from, to }` → 通过 `editor.view.coordsAtPos` 计算屏幕坐标
3. 将坐标设为 Floating UI 的 `virtualReference`，`autoUpdate` 负责跟随滚动更新位置

### Diff Block 工作流

```
insertDiffNode(from, to, newText, suggestionId)
  → 读取 originalText
  → 字符级 LCS diff → 生成 DiffChange marks
  → 替换原文为 DiffBlock 节点

acceptDiff(suggestionId) → 保留 added，移除 removed
rejectDiff(suggestionId) → 保留 removed，移除 added
```

### 流式写入

`useStreamWriter` 使用 RAF 循环（50ms 节流）将流式 HTML 写入编辑器：
- 简单块（`p`、`h1`–`h6`）：流式预览，自动补全闭合标签
- 复杂块（`ul`、`ol`、`blockquote`、`pre`）：等待完整后再插入

## 添加新扩展

1. 在 `extensions/` 下创建文件，使用 `Extension.create` / `Node.create` / `Mark.create`
2. 在 `editor.tsx` 的 `extensions` 数组中注册
3. 如需在 BubbleMenu 中暴露操作，在 `bubble-menu/index.tsx` 的 `useEditorState` selector 中订阅状态，并在 JSX 中添加对应按钮
4. 如需在 Slash 菜单中暴露，在 `slash-command/commands.ts` 中添加 `SlashCommandId` 和菜单项，在 `slash-command/index.tsx` 的 `runSlashCommand` 中添加对应 case
