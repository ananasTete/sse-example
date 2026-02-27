## 通过 sidebar 的自定义属性 state=collapsed、collapsible=icon 判定折叠状态来隐藏部分UI

1. 隐藏 header 中的折叠按钮
2. 隐藏 footer 中的设置按钮的文本
3. 隐藏 content 中历史记录列表
4. 隐藏 content 中“新聊天”按钮的文本

2,3,4 都使用 opacity: 0 + visibility: hidden + transition 的方案实现淡入淡出的过渡动画效果

## CSS 隐藏元素方案对比、

| 方案               | 占据空间 | 响应点击 | 屏幕阅读器 | 过渡动画 |
| ------------------ | -------- | -------- | ---------- | -------- |
| display: none      | ❌       | ❌       | ❌         | ❌       |
| visibility: hidden | ✅       | ❌       | ❌(通常)   | ❌       |
| opacity: 0         | ✅       | ✅       | ✅         | ✅       |

### 在实践中显示隐藏经常需要淡入淡出的过渡动画效果

只有 opacity: 0 才能实现淡入淡出的过渡动画效果，但它仍然可响应点击，所依实践中和 visibility: hidden 结合使用：设置 visibility: hidden 并加一个 transition 动画，
实际效果就是在动画结束后元素立即消失不会有真正的过渡。这样既有了动画效果又在动画结束后元素消失，详见 chat-sidebar-collapsible-text.tsx 组件。

display: none 这种 DOM 卸载场景下想要动画要使用 framer-motion 库实现。

实践：

1. ICON、文本、简单组件的淡入淡出动画使用 opacity: 0 + visibility: hidden + transition 的方案。
2. DOM 卸载显示动画、路由切换动画、复杂的布局动画、串联动画、弹簧动画使用 framer-motion 库。

## 鼠标在折叠状态下 hover 可交互元素之外的区域时，替换LOGO、显示右箭头光标、点击后触发展开

给在折叠后也能交互的元素如“新聊天“、“设置按钮“添加自定义属性 data-interactive="true" 标记为可交互元素。

在 sidebar 的 mouseMove 事件中判断 处于折叠状态 && 不是可交互元素 下标记 isPassiveHover = true。

当 isPassiveHover = true 时：

1. 替换 header 中的 LOGO 为展开 ICON
2. 鼠标变为右箭头

触发点击事件时实现展开操作

## sidebar 的宽度是不固定的，是 rem 单位，所以其中的元素注意要考虑 w-full
