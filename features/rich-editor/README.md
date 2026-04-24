## 如何理解 Extension ?

提供一套“完整的功能包”，可以：

1. `addCommands()` 注册命令
2. `addStorage()` 注册编辑器运行时状态
3. `addKeyboardShortcuts()` 绑定 `Cmd+B` 之类的快捷键。
4. 定义规则（Rules）比如输入 `**` 自动加粗的输入规则（Input Rules），或者粘贴 HTML 时的过滤规则（Paste Rules）。
5. `addProseMirrorPlugins()` 注册 ProseMirror 插件

### 如何理解 Command ?

在 ProseMirror 中，任何变更（对编辑器内容的修改、光标的移动、格式的变换，甚至内部状态的更新）都必须通过分发事务来完成。

1. tr (Transaction) 事务，它是一个“意图”对象。你不能直接修改 state，你必须创建一个 tr，描述你想要做什么（比如“在光标位置插入一个图片节点”），然后把这个 tr 提交给编辑器。
2. dispatch(tr) 提交事务，编辑器接收到 tr 后，会根据这个事务生成一个新的 state，并触发视图更新。

在 Tiptap 中，通过 Command 系统来实现对 tr 的上层封装来实现变更

1. Extension、Node 中都可以通过 `addCommands` 来添加命令
2. 在 UI 中任何位置都可以通过 `editor.commands.insertImageTag()` 来调用命令
3. 封装了常见的变更行为，不需要开发者自己去写底层 dispatch(tr)，如insertContent
4. 非常见行为，还是需要自己在 command 中定义 `dispatch(tr)`

### 如何理解 addKeyboardShortcuts()

可以向编辑器注册快捷键，返回一个对象，键是快捷键，值是回调函数。

可以直接将单个键作为 key，如 `"Backspace"`，也可以是组合键，如 `"Shift-Backspace"`。

### 如何理解 Storage ?

- 挂载在编辑器实例上的全局运行时状态
- `Attributes`（属性）是保存在**每个具体节点（Node）**上的（比如文档里有 10 个图片标签，就有 10 份属性）；而 `Storage`（存储）是保存在**编辑器实例**上的（1 个编辑器实例只有 1 份 Storage）。它不会被序列化到 JSON 中，只在运行时有效。
- 可以通过 commands 来更新
- 因为不会计入文档，所以也不可撤销

## 如何理解 Plugin ？

1. 装饰器（Decorations）：在不改变文档数据结构的前提下，在页面上绘制高亮、悬浮组件、空行提示符（Placeholder）等虚拟 DOM 元素。
2. 拦截与处理 Transaction（事务）：在文档每次发生变化时（`state.apply`），计算和维护与文档变化强绑定的内部状态。
3. 底层 DOM 事件处理：通过 `props.handleDOMEvents` 监听原生的 `click`、`keydown`、`drop` 等事件，甚至可以阻止编辑器的默认行为。
4. 视图生命周期监控：通过 `view.update` 监听整个编辑器视图的重绘。

## BubbleMenu 开发

### useEditorState

**为什么要使用 `useEditorState` ?**

因为编辑器实例 editor 是可变数据，他内部的状态变化比如某段文本高亮、加粗不会引起 react 的重渲染，使用 `useEditorState` hook 后，每次 `transaction` 触发后都会调用一次 `selector` 并与上次结果进行深对比，结果变化时触发更新
不同则会触发 react 更新。即将 tiptap 的指定变更引入 react 的响应式系统

**在 `bubble-menu` 的使用方式**

1. 划词之后可以通过 menu 来更新选中文本样式比如加粗，那加粗之后也要将加粗按钮来高亮表示。这就是 `useEditorState` 这个场景的用途：在监听到变化后触发高亮按钮的重渲染。
2. 因为有很多 menu 菜单，所以要订阅很多更新。AI 说 `transaction` 在编辑器触发频率很高，每次光标移动、输入字符、格式切换等都会触发，如果在每个菜单单独订阅数据，在每次 `transaction` 后执行 `selector` 并对比使用 `memo` 的成本更高，所以这里使用： 单点订阅 + `React.memo`

### 分步菜单

在这个 bubble-menu 中，划词之后先出现用于 format 的面板，点击 AI 按钮后替换为 AI 面板。

**为什么 format 面板和 AI 面板不能在 bubble-menu 组件内部切换，且是要 AI 面板单独定位？**

Tiptap 内置的 `BubbleMenu` 强绑定了编辑器的焦点和选区。默认情况下，一旦编辑器失去焦点（比如用户点击了 AI 面板里的 `textarea` 输入框），或者选区为空，`BubbleMenu` 就会自动消失。在 textarea 输入时，焦点必定在输入框中不在编辑器，所以为了面板可以在输入时存在，就必须要自己实现定位

**点击 format 面板不也会让编辑器失去焦点吗？为什么我在点击后 format 菜单可以做到不消失，但要在 textarea 中输入就要失去焦点？**

因为我们通过链式调用机制：`onClick={() => editor.chain().focus().toggleBold().run()}` 。实际的流程是：点击按钮 -> 失去焦点 -> 触发 onClick -> `focus()` 拉回焦点并恢复选区 -> 执行加粗 -> 视图更新。即通过 `focus()` 又把焦点拉回编辑器，因为很快所以看不出来，但在 textarea 连续输入就必须要求焦点一直在 textarea 中。

#### 如何实现失去选区后也能在指定位置定位面板？

点击 AI 按钮之后，把选区的 bookmark 数据存储到状态，在 AI 面板中使用 useEditorState 从 bookmark 中计算 from/to，再根据 from/to 计算选区坐标信息，设置为浮动元素的 virtualReference。这样浮动元素就定位在了之前选区的位置。

**为什么要把 from/to 转为 bookmark，再转为 from/to 去计算坐标信息？**

如果直接存储 from/to，在选区前插入内容后，原始坐标会指向旧位置。bookmark 是 selection 的可恢复引用，AI 面板打开期间监听 editor 的 transaction 事件，并在文档变化时执行 `bookmark.map(transaction.mapping)`，让 bookmark 跟随文档变化移动。`useEditorState` 在每次 dispatch(tr) 后重新从最新 bookmark 中解析出 from/to，再用 from/to 计算选区坐标。通过 useEffect 触发重新计算原内容的新位置信息，进而更新气泡菜单的位置。

即：文档内容变化 -> 触发 ProseMirror Transaction (tr) -> transaction 监听器执行 `bookmark.map(tr.mapping)` -> 保存新的 bookmark -> `useEditorState` 的 selector 重新执行 -> `resolveSavedSelection` 重新解析 bookmark -> 得到新的 `{ from, to }` -> `virtualReference` 的依赖（selectionRange）改变，触发重绘 -> 面板位置更新。

**那如何实现滚动容器时编辑器的选区在屏幕的位置发生了变化，气泡菜单也跟随移动？这种情况也会触发 tr 导致 range 更新吗？**

不是，容器滚动不会触发 dispatch(tr)。我们是通过 floating-ui 的 autoupdate 机制来实现跟随因为滚动导致的 virtualReference 的位置变化，他会重新调用 getBoundingClientRect 方法计算新的坐标位置。

**如何理解 `<FloatingPortal>`?**

他会把气泡菜单定位到 body 上，不用就定位到 reference 。因为气泡菜单是 absolute 定位的，不定位到 body 上，那 reference 到 body 的多个层级元素都可能影响气泡菜单的表现，所以这是标准实现。浮层的位置仍由 Floating UI 根据 reference 的屏幕坐标计算，portal 改变的是 DOM 挂载位置。

#### 如何解决编辑器焦点消失后选区高亮也消失，即使看到 AI 面板也看不到用户划词范围的问题？

`ai-selection-highlight.ts` 自定义插件通过 `Decoration` 来实现自定义选区高亮，这是一个 Decoration 的好案例

Decoration 需要自定义 Plugin 来实现，并且要在 Plugin.state 中存储和管理所有 Decoration。为了通知 Plugin 为指定选区配置 Decoration，我们需要使用 Commands 通过 tr.setMeta 来触发 Plugin.state.apply 方法。

**如何理解 setMeta ?**

因为插件的状态（Plugin State）不属于文档数据（Schema / Doc），setMeta 给 transaction 附加的元信息，用来驱动 plugin state 更新；transaction 本身可以修改 doc、selection、marks，也可以只携带 meta。

Plugin.state.apply() 方法会在任何 dispatch(tr) 之后被自动调用。

**如何理解 `DecorationSet` ?**

`DecorationSet` 是一个专门用来管理和优化装饰器的特殊数据结构。

1. 为什么需要一个专门的 "Set" 而不是用数组管理 Decoration?

想象一下，如果你有一篇长达几万字的文章，里面有上百个拼写错误的下划线、十几个 AI 正在处理的高亮区块、还有几个其他用户的光标位置。 如果每次页面滚动或者用户打字时，编辑器都要遍历整个数组去问：“当前屏幕这一段文本，有没有碰到哪个高亮？” 这种 $O(N)$ 的遍历会导致极大的性能问题，输入会非常卡顿。`DecorationSet` 在底层是一个经过高度优化的树形结构它可以极其快速地回答“在文档的第 100 到 200 个字符之间，有哪些装饰器？”（渲染视图时必须知道）。

2. 核心能力：自动计算位置偏移（Mapping）

我们在编辑文章时，文本的长度是不断变化的。如果你在第 10 个字符处插入了 5 个字，那么原来在第 100-200 字符的高亮，理论上应该自动变成 105-205 字符。如果是普通数组，你需要手动写一个循环去更新每一个坐标。但因为有了 `DecorationSet`，你只需要调用这一行代码（也就是你文件里写的那行）：`oldSet.map(tr.mapping, tr.doc)` 会自动计算出所有 Decoration 的新位置并返回新的 `DecorationSet`

3. DecorationSet 是不可变的，增删改都是在返回新对象
