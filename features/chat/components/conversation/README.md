## 使用 framer-motion 的 layout 动画实现输入框的平滑滚动，配合 messages 使用 opacity 实现隐藏

layout 动画是 Framer Motion 帮你做的“布局变化补间”。你只改 React 布局（位置变化/尺寸变化/容器变化），它会自动测量变化前后，再用 transform 做平滑过渡（本质是 FLIP 思路）
