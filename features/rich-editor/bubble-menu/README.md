1. 模拟 select 菜单，并统一展开方向
2. 多级气泡菜单，解决持续选取高亮问题

### editor 事件订阅太分散，导致重复监听 + 重复 rerender（性能/维护性）

#### 问题

BubbleMenu 的每个子组件都在 editor.on('transaction'|'selectionUpdate') 里 forceUpdate({})，同一次 editor transaction 会广播给所
有订阅者，每个订阅者都会各自调用一次 React 的 setState。

#### 解决方案

把对 editor 的订阅收敛到 BubbleMenu 根组件（或一个 hook）里，只订阅一次，然后把“派生 UI 状态”通过 props 下发，子组件全部变成纯展示组件。

```typescript
const ui = useEditorState({
  editor,
  selector: ({ editor }) => {
    const selection = editor.state.selection;
    return {
      selectionEmpty: selection.empty,
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      underline: editor.isActive("underline"),
      code: editor.isActive("code"),
      textColor: editor.getAttributes("textStyle").color ?? null,
      highlight: editor.getAttributes("highlight").color ?? null,
    };
  },
});
```
