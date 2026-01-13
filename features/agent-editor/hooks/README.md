### 分析

#### 为什么在"清除选中模式"函数里要手动制定光标位置？我们滑词选择之后点击编辑器之外的输入框，编辑器不会自动失去焦点吗？选区不会自动清除吗？他会保留直到下次点击编辑器会再次显示滑 词选择效果吗？

TipTap/ProseMirror 的选区行为

编辑器失去焦点时：

- 视觉上选区高亮会消失
- 但编辑器内部的 selection state 不会自动清除，它会记住 from 和 to 的位置

为什么要手动设置光标位置？

看这个场景：

1. 用户在编辑器选中文本 → 点击聊天输入框 → activateSelectionMode 检测到 from !== to，进入 selection 模式
2. 用户点击编辑器 → 触发 focus → 调用 clearSelectionMode
3. 如果不清除选区：编辑器的 selection state 仍然是 {from: 10, to: 50}
4. 用户再次点击聊天输入框 → activateSelectionMode 再次检测到 from !== to → 又进入 selection 模式

这不是用户想要的。用户点击编辑器是想取消选中模式，而不是暂停它。

setTextSelection(to) 的作用

把选区折叠成光标（from === to），这样：

- 下次调用 activateSelectionMode 时，from === to 检查返回 false
- 不会意外重新激活选中模式

简单说：浏览器会清除视觉效果，但 TipTap 会记住选区状态。手动设置是为了彻底清除这个状态。

#### 这也是为什么我们点击输入框时还能拿到选区信息缓存下来对吗？

对，正是这个原因。

流程是这样的：

1. 用户在编辑器选中文本 "Hello World"
2. 用户点击聊天输入框
3. 编辑器失去焦点 → 视觉高亮消失
4. 但 editor.state.selection 仍然是 {from: 10, to: 21}
5. activateSelectionMode 读取这个 state，缓存到 selectionInfo

如果浏览器自动清除选区状态，这个功能就没法实现了——点击输入框时 from === to，检测不到有选区。

所以 TipTap 保留选区状态是个特性，不是 bug。我们利用它实现了"选中文本 → 点击输入框 → 针对选中内容提问"的交互。
