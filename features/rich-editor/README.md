## BubbleMenu 开发

### useEditorState

**为什么要使用 `useEditorState` ?**

因为编辑器实例 editor 是可变数据，他内部的状态变化比如某段文本高亮、加粗不会引起 react 的重渲染，使用 `useEditorState` hook 后，每次 `transition` 触发后都会调用 `selector` 回调执行一次与上次结果进行深对比，
不同则会触发 react 更新。即将 tiptap 的指定变更引入 react 的响应式系统

**在 `bubble-menu` 的使用方式**

1. 划词之后可以通过 menu 来更新选中文本样式比如加粗，那加粗之后也要将加粗按钮来高亮表示。这就是 `useEditorState` 这个场景的用途：在监听到变化后触发高亮按钮的重渲染。
2. 因为有很多 menu 菜单，所以要订阅很多更新。AI 说 `transition` 在编辑器触发频率很高，每次光标移动、输入字符、格式切换等都会触发，如果在每个菜单单独订阅数据，在每次 `transition` 后执行 `selector` 并对比使用 `memo` 的成本更高，所以这里使用： 单点订阅 + `React.memo`
