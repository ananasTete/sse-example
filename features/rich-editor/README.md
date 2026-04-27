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

因为编辑器实例 editor 内部的状态变化比如某段文本高亮、加粗不会引起 react 的重渲染，使用 `useEditorState` hook 后，每次 `transaction` 触发后都会调用一次 `selector` 并与上次结果进行深对比，结果变化时触发 react 更新。即：将 tiptap 的指定变更引入 react 的响应式系统

**在 `bubble-menu` 的使用方式**

1. 划词之后可以通过 menu 来更新选中文本样式比如加粗，那加粗之后也要将加粗按钮来高亮表示。这就是 `useEditorState` 这个场景的用途：在监听到变化后触发高亮按钮的重渲染。
2. 因为有很多 menu 菜单，所以要订阅很多更新。AI 说 `transaction` 在编辑器触发频率很高，每次光标移动、输入字符、格式切换等都会触发，如果在每个菜单单独订阅数据，在每次 `transaction` 后执行 `selector` 并对比使用 `memo` 的成本更高，所以这里使用： 单点订阅 + `React.memo`

### 分步菜单

在这个 bubble-menu 中，划词之后先出现用于 format 的面板，点击 AI 按钮后替换为 AI 面板。

**为什么 format 面板和 AI 面板不能在 bubble-menu 组件内部切换，而是要 AI 面板单独定位？**

Tiptap 内置的 `BubbleMenu` 强绑定了编辑器的焦点和选区。默认情况下，一旦编辑器失去焦点（比如用户点击了 AI 面板里的 `textarea` 输入框），或者选区为空，`BubbleMenu` 就会自动消失。在 textarea 输入时，焦点必定在输入框中不在编辑器，所以为了 AI 面板可以在输入时存在，就必须要自己实现定位

**点击 format 面板不也会让编辑器失去焦点吗？为什么我在点击后 format 菜单可以做到不消失，但要在 textarea 中输入就要失去焦点？**

因为我们通过链式调用机制：`onClick={() => editor.chain().focus().toggleBold().run()}` 。实际的流程是：点击按钮 -> 失去焦点 -> 触发 onClick -> `focus()` 拉回焦点并恢复选区 -> 执行加粗 -> 视图更新。即通过 `focus()` 又把焦点拉回编辑器，因为很快所以看不出来，但在 textarea 连续输入就必须要求焦点一直在 textarea 中。

#### 如何实现失去焦点后也能在指定位置定位面板？

点击 AI 按钮之后，把当前选区写入 `AISelectionHighlight` 的 ProseMirror plugin.state from/to。AI 面板从 plugin state 读取 `{ from, to }`，再根据 range 计算选区坐标信息，设置为浮动元素的 virtualReference。这样浮动元素就定位在了之前选区的位置。

**为什么不使用 bookmark?**

1. AI 面板期间不支持继续编辑正文，选区前插入内容导致坐标偏移的场景不属于当前交互。
2. 点击 AI panel、textarea、外部区域主要影响 DOM focus 和浮层状态，`editor.state.selection` 通常仍保留原选区。
3. 统一的 plugin state 已经是讨论选区的事实源，React 只需要保存面板开关和输入内容。

**那如何实现滚动容器时编辑器的选区在屏幕的位置发生了变化，气泡菜单也跟随移动？这种情况也会触发 tr 导致 range 更新吗？**

不是，容器滚动不会触发 dispatch(tr)。我们是通过 floating-ui 的 autoupdate 机制来实现跟随因为滚动导致的 virtualReference 的位置变化，他会重新调用 getBoundingClientRect 方法计算新的坐标位置。

**如何理解 `<FloatingPortal>`?**

他会把气泡菜单定位到 body 上，不用就定位到 reference 。因为气泡菜单是 absolute 定位的，不定位到 body 上，那 reference 到 body 的多个层级元素都可能影响气泡菜单的表现，所以这是标准实现。浮层的位置仍由 Floating
UI 根据 reference 的屏幕坐标计算，portal 改变的是 DOM 挂载位置。

PS：划词后点击编辑器外部，选区消失了是指浏览器层面的消失了，但选区信息还在 editor 中保存，是可以获取的/直到下次点击编辑器来更新选区。

#### 如何解决编辑器焦点消失后选区高亮也消失，即使看到 AI 面板也看不到用户划词范围的问题？

`ai-selection-highlight.ts` 自定义插件通过 `Decoration` 来实现自定义选区高亮。

Decoration 需要自定义 Plugin 来实现，并且要在 Plugin.state 中存储 from/to 。为了通知 Plugin 为指定选区配置 Decoration，我们需要使用 Commands 通过 tr.setMeta 触发 Plugin.state.apply 方法来实现更新 from/to，props.decorations 返回根据 from/to 创建的 Decoration。

**如何理解 setMeta ?**

因为插件的状态（Plugin State）不属于文档数据（Schema / Doc），setMeta 给 transaction 附加的元信息，用来驱动 plugin state 更新；transaction 本身可以修改 doc、selection、marks，也可以只携带 meta。

Plugin.state.apply() 方法会在任何 dispatch(tr) 之后被自动调用。

**如何理解 `DecorationSet` ?**

`DecorationSet` 是一个专门用来管理和优化装饰器的特殊数据结构。props.decorations 需要返回一个 DecorationSet。

1. 为什么需要一个专门的 "Set" 而不是用数组管理 Decoration?

想象一下，如果你有一篇长达几万字的文章，里面有上百个拼写错误的下划线、十几个 AI 正在处理的高亮区块、还有几个其他用户的光标位置。 如果每次页面滚动或者用户打字时，编辑器都要遍历整个数组去问：“当前屏幕这一段文本，有没有碰到哪个高亮？” 这种 $O(N)$ 的遍历会导致极大的性能问题，输入会非常卡顿。`DecorationSet` 在底层是一个经过高度优化的树形结构它可以极其快速地回答“在文档的第 100 到 200 个字符之间，有哪些装饰器？”（渲染视图时必须知道）。

2. 核心能力：自动计算位置偏移（Mapping）

我们在编辑文章时，文本的长度是不断变化的。如果你在第 10 个字符处插入了 5 个字，那么原来在第 100-200 字符的高亮，理论上应该自动变成 105-205 字符。如果是普通数组，你需要手动写一个循环去更新每一个坐标。但因为有了 `DecorationSet`，你只需要调用这一行代码（也就是你文件里写的那行）：`oldSet.map(tr.mapping, tr.doc)` 会自动计算出所有 Decoration 的新位置并返回新的 `DecorationSet`

3. DecorationSet 是不可变的，增删改都是在返回新对象

#### 注意在替换本地文本时的光标问题

之前：选中文本：hello，AI 返回：<strong>hello</strong>，当前 caretPos = from + streamingResult.length 会按 22 个字符算；实际插入后文档文本只有 hello 5 个字符，光标大概率越界或落到异常位置。

```ts
const caretPos = from + streamingResult.length;

editor
  .chain()
  .focus()
  .deleteRange({ from, to })
  .insertContentAt(from, streamingResult)
  .setTextSelection(caretPos)
  .run();

onClose({ reason: "replace", caretPos });
```

之后：用 Tiptap 自带的 insertContentAt({ from, to }, content, { updateSelection: true }) 一次完成替换，并从插入后的 editor selection 读取真实光标位置。

```ts
editor
  .chain()
  .focus()
  .insertContentAt({ from, to }, streamingResult, { updateSelection: true })
  .run();

const caretPos = editor.state.selection.to;

onClose({ reason: "replace", caretPos });
```

## 如何实现在划词后在 AgentChat 中引用并同步？

在 use-editor-agent 中

1. 监听 selectionUpdate 事件，调用 setAISelectionHighlight 命令，更新 Plugin.state from/to 数据作为唯一事实来源。
2. 使用 useEditorState 来订阅 from/to 并计算 text 支持 UI 显示“正在讨论 xxx“。

## 如何实现编辑器 DIFF 视图？

# 划词 AI 上下文与段落级 Diff 统一重构计划

## Summary

Bubble Menu AI 面板和右侧 AgentChat 统一使用最小划词协议：`requestId + message + selection.contentWithSelection`。`contentWithSelection` 是完整 HTML 正文，当前划词内容用临时内联标记包住。服务端流式返回 `{ requestId, oldText, newText }`，前端用运行时 pending snapshot 定位当前编辑器内容，并插入段落级 `diffBlock`。

`origin.id`、`origin.type`、`atReferences.type`、`originId`、`originType`、`isContentEqualFullText` 当前没有消费点，全部删除。

## Protocol

前端统一请求格式：

```ts
type EditorAIRequest = {
  requestId: string;
  message: string;
  selection: {
    contentWithSelection: string;
  };
};
```

服务端 patch 结果格式：

```ts
type EditorAIPatchResult = {
  requestId: string;
  oldText: string;
  newText: string;
};
```

字段规则：

- `requestId`：每次 AI 请求唯一，用于匹配运行时 pending snapshot 和流式结果。
- `message`：用户输入的 AI 指令。
- `selection.contentWithSelection`：完整 HTML 正文，选区文本被 `<span data-ai-selection="true">...</span>` 包住。
- 文档定位、选区定位、段落拆分全部由前端运行时 snapshot 和当前 editor state 负责。

## Implementation Changes

- 增加统一上下文模块：
  - `createEditorAIRequest(editor, message)` 生成 `requestId`、`contentWithSelection`、`oldText`、pending snapshot。
  - pending snapshot 保存在运行时 registry，key 为 `requestId`。
  - snapshot 记录 `oldText`、选区覆盖的 textblock 信息、原 block 文本、block 内 offset。
- 增加临时选区 HTML 标记：
  - 新增临时 mark，例如 `aiSelectionReference`，渲染为 `<span data-ai-selection="true">...</span>`。
  - 构建 `contentWithSelection` 时基于临时 editor state 序列化 HTML，编辑器正文保持原样。
  - 服务端通过 `data-ai-selection="true"` 提取 `oldText`。
- 统一 Bubble Menu 和 AgentChat：
  - Bubble 提交时调用 `createEditorAIRequest`，请求 patch stream，成功后调用统一 patch applicator 插入 Diff。
  - AgentChat 提交时调用同一构建器，把 `EditorAIRequest` JSON 作为 user message text 发送到 `/api/agent-editor/:chatId`。
  - ContextBar 继续展示当前 selection snapshot 的短文本。
- 增加 patch applicator：
  - `applyEditorAIPatch(editor, patch, registry)` 通过 `requestId` 找 snapshot。
  - 优先用 snapshot 的 textblock hint 定位当前文档。
  - hint 失效时用 `oldText` 在当前文档 textblocks 精确搜索。
  - 匹配失败时返回 stale 状态，UI 显示“原文已变化，请重新选择后生成”。
- 升级段落级 Diff：
  - `oldText/newText` 按段落边界拆分。
  - 段落数量一致时，每个变化段落插入一个独立 `diffBlock`。
  - 段落数量变化时，将连续变化区域合并成一个 `diffBlock`。
  - `diffBlock` 增加多段 paragraph 内容支持和字符级 diff，生成多段 `diffchange removed/added`。
  - 保留现有 `insertDiffNode(from, to, newText, suggestionId)` 兼容旧调用。

## Refresh Behavior

- pending snapshot 放在内存 registry。
- 页面刷新会清空 pending snapshot。
- 当前页面刷新中断 Bubble 和 AgentChat 的进行中请求。
- 未来支持流式恢复时，恢复后的流继续更新聊天消息；编辑器 patch application 在缺少 runtime snapshot 时进入只读结果态。
- 服务端返回的 `{ oldText, newText }` 仍可展示给用户，编辑器 Diff 插入由当前页面生命周期内的 snapshot 驱动。

## Test Plan

- 类型与构建：
  - `npm run build`
  - `npm run lint`
- 纯函数测试：
  - `createEditorAIRequest` 只生成 `requestId/message/selection.contentWithSelection`。
  - `contentWithSelection` 包含完整 HTML，并只给选区加 `data-ai-selection="true"`。
  - 服务端能从跨段 HTML 选区提取正确 `oldText`。
  - `oldText/newText` 段落数量一致时生成多个段落 patch。
  - 段落数量变化时生成连续变更 patch。
  - 字符级 diff 能生成多处 removed/added mark。
- 手动验收：
  - Bubble 单段划词生成一个可接受/拒绝 diffBlock。
  - Bubble 跨段划词生成多个段落级 diffBlock，每段独立操作。
  - AgentChat 使用同一划词后生成相同类型的 diffBlock。
  - 请求发出后修改正文其他位置，patch 仍能插入到原选区段落。
  - 请求发出后修改原选区文本，UI 进入 stale 提示。
  - 刷新页面后恢复流只展示消息内容，编辑器正文保持用户当前内容。

## Assumptions

- 当前协议只支持一个 selection reference。
- 同一页面生命周期允许多个 pending 请求并存，使用 `requestId` 精确匹配。
- 段落拆分、字符级 diff、HTML 选区提取使用本地工具函数实现。

## 未来支持多人协同设计

如果我的项目允许多个人参与，并允许多个人打开同一份文档编辑时，从产品设计角度来说，应该是什么样的流程？每个人可以看到其他的修改内容并实时同步，其他人修改完成提交后出现差异，其他人的操作栏出现同步按钮，点击查看 DIFF 并手动同步？

AI 面板可多人同时打开，每个人只看到自己的面板和自己的高亮。
每个 AI 请求保存 range + selectedTextSnapshot + docVersion/clientVersion。
提交替换前，把原始 range 通过协同编辑 mapping 映射到当前文档位置。
校验当前位置的文本是否仍等于 selectedTextSnapshot。
一致：直接替换。
不一致：进入冲突处理，让用户选择“查看差异后替换当前内容 / 插入到当前位置后面 / 取消”。

用户在右侧 chatbot 输入需求。
AI 基于当前文档版本生成一个 ChangeSet，包含多条 patch：
targetRange / originalTextSnapshot / proposedText / reason
UI 在正文里标出所有建议修改，右侧显示变更列表。
用户可以逐项接受、逐项拒绝、或全部接受。
接受每一项时都做冲突校验：映射 range 后比较当前文本和 originalTextSnapshot。
一致则应用；已变化则标为“需要处理冲突”，展示当前文本、原始文本、AI 建议三方 diff。

那如果我划词之后提交之前，别人修改了这段内容，那我划词内容会实时跟随别人的修改还是保持鱼啊内容？

具体状态分三层：

range 跟随协同编辑 mapping 移动，保证面板和高亮还锚在用户当初选中的那段位置。
selectedTextSnapshot 保持打开 AI 面板时的原文，用作 prompt 上下文和冲突校验。
currentTextAtRange 实时读取最新文档内容，用来判断别人是否改过这段。
如果别人只在这段前面插入内容，range 应该自动后移，AI 面板位置跟随。

如果别人修改了这段内部内容，面板里显示“选中内容已更新”，提供两个动作：

基于最新内容重新生成
继续使用原始内容
点击提交时再校验一次。当前文本和 snapshot 一致则直接替换；不同则展示 diff，让用户确认替换当前内容、插入为建议、或取消。这样用户的 AI 草稿稳定，协作文档也不会被旧上下文静默覆盖。
