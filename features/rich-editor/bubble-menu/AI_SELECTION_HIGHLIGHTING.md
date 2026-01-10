# AI 选区高亮与原生选区冲突解决方案

## 问题背景 (The Problem)

在开发 AI 浮动面板功能时，我们遇到一个 UI/UX 问题：

当我们点击“AI”按钮打开 AI 面板时，我们希望选中的文本显示为自定义的“紫色”背景，以配合 AI 功能的视觉风格。然而，实际操作中会出现以下情况：

1.  **颜色叠加/残留**：浏览器原生的蓝色选区背景（Native Selection）经常会与我们要添加的紫色背景（Custom Decoration）叠加，或者在某些边缘会有蓝色的残留。
2.  **焦点转移导致选区消失**：当用户开始在 AI 面板的输入框中打字时，编辑器（Editor）失去了焦点（Blur）。浏览器默认行为是隐藏或淡化失去焦点的选区。但这会导致用户忘记自己刚才选了什么，体验很差。

## 最初的尝试 (Initial Attempt)

为了解决原生蓝色背景干扰的问题，我们最初尝试在打开面板时强制清除浏览器选区：

```typescript
// ❌ Deprecated Strategy
window.getSelection()?.removeAllRanges();
```

**这种方案的问题**：

1.  **破坏状态**：强制清除 DOM 选区可能导致编辑器内部状态（Tiptap/ProseMirror State）与 DOM 不一致。
2.  **副作用**：可能影响后续的光标恢复或其他依赖选区的功能。

## 问题的本质 (Root Cause)

这个问题的本质是 **“选区状态的双重性” (The Duality of Selection State)** 以及 **“焦点管理” (Focus Management)**。

1.  **两套选区系统**：
    - **Browser (DOM)**: 负责渲染原生的蓝色背景。
    - **Editor (Model)**: 负责逻辑上的选区。
2.  **为什么需要自定义装饰器 (Decorator)？**
    - 因为当焦点转移到 AI 面板输入框时，原生选区会消失（或者变得不可见）。我们需要一个**顽强**的视觉元素，无论焦点在哪里，都能告诉用户“这段文字正被 AI 处理”。
3.  **冲突点**：
    - 当我们加上自定义装饰器时，如果浏览器同时也渲染了原生选区（因为逻辑上确实还没取消选中），就会发生视觉冲突（蓝+紫）。

## 最终解决方案 (The Solution)

采用了 **“视觉隐藏 + 装饰器持久化”** 的组合方案。

### 1. 保持选区，但在视觉上隐藏它

不在 JS 逻辑中删除选区，而是通过 CSS 欺骗浏览器。当 AI 面板激活时，我们强制将原生选区的背景色设为透明。

**`features/rich-editor/editor.css`**:

```css
/* AI Panel Active State - Hide native selection */
/* 当 AI 面板激活时，隐藏浏览器原生的蓝色选区背景，只显示自定义的高亮 */
.ProseMirror.ai-panel-active *::selection {
  background-color: transparent !important;
  color: inherit;
}

.ProseMirror.ai-panel-active::selection {
  background-color: transparent !important;
  color: inherit;
}
```

### 2. 通过 React State 管理样式类

在 `BubbleMenu` 组件中，监听面板的开启状态，动态给编辑器容器添加/移除 `ai-panel-active` 类。

**`features/rich-editor/bubble-menu/index.tsx`**:

```typescript
// 当 AI 面板显示时，在编辑器容器上添加类名，配合 CSS 隐藏原生选区
useEffect(() => {
  if (showAIPanel) {
    editor.view.dom.classList.add("ai-panel-active");
  } else {
    editor.view.dom.classList.remove("ai-panel-active");
  }

  return () => {
    editor.view.dom.classList.remove("ai-panel-active");
  };
}, [showAIPanel, editor]);
```

### 3. 使用 Decoration 保持视觉反馈

继续使用我们自定义的 Tiptap Extension (`ai-selection-highlight`) 来渲染紫色的背景。因为这是一个 DOM 装饰器，它不受浏览器“选区焦点”逻辑的影响，始终显示。

## 总结

我们通过 **CSS 隐藏原生行为** + **Decorator 模拟自定义行为**，完美解决了焦点转移时的选区高亮问题，既保证了视觉风格的统一，又避免了破坏底层选区状态带来的风险。
