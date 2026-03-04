## 折叠时隐藏文本和历史记录并添加过渡动画

通过 sidebar 的自定义属性 state=collapsed、collapsible=icon 判定折叠状态。

content 中“新聊天”按钮的文本、footer 中的设置按钮的文本见 chat-sidebar-collapsible-text.tsx 组件。
content 中历史记录列表见 chat-sidebar-history.tsx 组件。

使用 opacity: 0 + visibility: hidden + transition 的方案实现淡入淡出的过渡动画效果。

## CSS 隐藏元素方案对比

| 方案               | 占据空间 | 响应点击 | 屏幕阅读器 | 过渡动画 |
| ------------------ | -------- | -------- | ---------- | -------- |
| display: none      | ❌       | ❌       | ❌         | ❌       |
| visibility: hidden | ✅       | ❌       | ❌(通常)   | ❌       |
| opacity: 0         | ✅       | ✅       | ✅         | ✅       |

### 在开发中，显示隐藏经常需要淡入淡出的过渡动画效果

只有 opacity: 0 才能实现淡入淡出的过渡动画效果，但它仍然可响应点击，所以实践中通常和 visibility: hidden 结合使用：在 transition 动画时间结束后设置 visibility: hidden，详见 chat-sidebar-collapsible-text.tsx 组件。

display: none 这种 DOM 卸载场景下想要动画要使用 framer-motion 库实现。

实践：

1. ICON、文本、简单组件的淡入淡出动画使用 opacity: 0 + visibility: hidden + transition 的方案。
2. DOM 卸载显示动画、路由切换动画、复杂的布局动画、串联动画、弹簧动画使用 framer-motion 库。

## 鼠标在 sidebar 折叠状态下 hover 到可交互元素之外的区域时，替换LOGO、鼠标显示右箭头光标、点击后触发展开

给在折叠后也能交互的元素如“新聊天“、“设置按钮“添加自定义属性 data-interactive="true" 标记为可交互元素。

在 sidebar 的 mouseMove 事件中判断 （处于折叠状态 && 不是可交互元素） 时标记 isPassiveHover = true。用来判定：

1. 替换 header 中的 LOGO 为展开 ICON
2. 鼠标变为右箭头

触发点击事件时实现展开操作

## sidebar 的宽度是不固定的，是 rem 单位，所以其中的元素注意要考虑 w-full

## 为请求加载添加骨架屏但请求速度快就会闪烁

实现 useDelayedVisibility 延迟显示骨架屏，避免闪烁。
