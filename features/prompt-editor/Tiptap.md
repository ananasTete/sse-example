### 1. `name: "imageTag"` (节点名称)

- **作用**：定义该节点在编辑器 Schema（数据结构）中的唯一标识符。
- **原理解释**：当你把编辑器内容导出为 JSON 时，这个节点对应的 `type` 就是 `"imageTag"`。同时，你在调用命令（如代码里的 `insertContent({ type: this.name })`）或者查询节点状态时，也会用到这个名字。

### 2. `group: "inline"` (分组归属)

- **作用**：将这个节点归类到 `"inline"`（行内元素）组。
- **原理解释**：ProseMirror 通过 `group` 来管理嵌套规则。例如，普通的段落（Paragraph）通常被配置为只能包含 `inline` 组的元素作为子节点。把 `ImageTag` 放入 `"inline"` 组，意味着它可以像普通的文字一样，被合法地插入到当前编辑器允许的段落内容中。

### 3. `inline: true` (行内级表现)

- **作用**：声明这个节点是一个行内级节点（类似于 HTML 中的 `<span>`、`<a>`），而不是块级节点（如 `<p>`、`<div>`）。
- **原理解释**：配合 `group: "inline"` 使用。它告诉编辑器的渲染引擎和排版系统，这个节点需要跟周围的文字紧密排布在同一行内，不会像块级节点那样强制换行。

### 4. `atom: true` (原子节点)

- **作用**：**这是非常关键的一个属性**。它将节点声明为一个“不可分割的原子整体”。
- **原理解释**：默认情况下，节点通常可以包含内容（比如段落里有几组文字）。设置为 `atom: true` 后，编辑器会把这个节点完全当成一个单一的字符来对待：
  - **光标行为**：光标无法进入节点内部，只能停留在它的前面或后面。
  - **删除行为**：按退格键（Backspace）时，会把整个节点当成一个整体一次性删除，而不会删掉节点内部的某些属性或一半的内容。它非常适合用来做“标签”、“@人”、“自定义表情”这种具象化的实体功能。

### 5. `selectable: true` (可选中)

- **作用**：允许用户在编辑器中“选中”这个节点。
- **原理解释**：开启后，你可以用鼠标点击将其高亮选中，或者通过键盘（如 `Shift + 左右方向键`）滑过并选中它。选中后，用户可以进行复制、剪切、或者按 Delete 直接删除整个节点。

### 6. `draggable: true` (可拖拽)

- **作用**：允许用户用鼠标按住该节点，并将其拖动到编辑器的其他位置。
- **原理解释**：开启原生或编辑器级的拖拽支持。结合后续代码中的 `addProseMirrorPlugins` (特别是 `dropIndicatorKey` 相关的代码)，它能够实现将这个 ImageTag 从一处拖拽，放置到另一段文字中间的高级交互。

---

### 7. `addOptions()`（一次性配置项）

- **作用**：定义这个扩展在“被注册/初始化”时可以接收的外部配置，并提供它们的**默认值**。
- **原理解释**：在编辑器初始化时，可以通过：`ImageTag.configure({ HTMLAttributes: { class: "my-custom-class" } })` 来给节点添加自定义的 HTML 属性。
- **自定义**：约定使用 `HTMLAttributes` 来传递自定义的 HTML 属性。当然可以配置任意自定义参数。在这个案例中可以配置 allowDrag、allowSelect、 等属性。

---

### 8. `addStorage()`（编辑器级状态）

- **作用**：挂载在编辑器实例上的状态
- **原理解释**：`Attributes`（属性）是保存在**每个具体节点（Node）**上的（比如文档里有 10 个图片标签，就有 10 份属性）；而 `Storage`（存储）是保存在**编辑器实例**上的（1 个编辑器实例只有 1 份 Storage）。它不会被序列化到 JSON 中，只在运行时有效。
- **那为什么 onBeforeDelete 不在 addOptions 配置呢？** 因为 tiptap 的 schema 是静态的，在初始化时就确定了，无法在运行时修改。如果把函数配置到 addOptions 就会引发闭包问题，所以 options 只用来配置确定的静态值，而不是变量或者函数。addStorage 的状态可以通过 commands 来修改，可以在每次函数依赖数据变化时重新赋值一次。

---

### 9. `addAttributes()`（节点级状态）

- **作用**：定义这个节点（Node）的数据模型。它说明这些数据怎么在 HTML（DOM字符串）和 JSON（编辑器内部结构）之间互相转换。为什么要转换？因为 HTML 是唯一的事实来源，节点中状态就要定义到 HTML 的自定义属性上才能持久化。才能在导出时携带状态，并在回显时恢复状态。
- **原理解释**：当一段包含这个节点的 HTML 被贴进编辑器时（粘贴动作），Tiptap 会调用 `parseHTML` 把 DOM 属性抓取并保存；当编辑器需要把 JSON 渲染回网页界面时，就调用 `renderHTML`。
- **本文件中的应用**：

  ```typescript
  addAttributes() {
    return {
      // 核心数据1：图片的唯一 ID
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"), // 从 <span data-image-id="123"> 里提取 "123"
        renderHTML: (attributes) => ({ "data-image-id": attributes.imageId }), // 渲染成 DOM 属性 "data-image-id"
      },
      // 核心数据2：用于页面上显示的文案（比如提示词）
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label"), // 从 <span data-label="美女"> 提取
        renderHTML: (attributes) => ({ "data-label": attributes.label }),
      },
    };
  }
  ```

---

### 10. `parseHTML()` (HTML -> JSON 翻译官)

- **作用**：当有外来的 HTML 代码进入编辑器时（比如**复制粘贴**，或者调用 `editor.commands.setContent('<span...>')`），带有 `data-type="image-tag"` 属性的 `<span>` 标签，就会被认定为 `ImageTag` 节点。并触发 add Attributes 中的 parseHTML 方法来解析其中的状态并恢复。

---

### 11. `renderHTML()` (JSON -> HTML 包装员)

- **作用**：当你想把编辑器里的内容导出为 HTML 字符串（通过调用 `editor.getHTML()` 方法）时，用来规定这个 JSON 节点对象应该被渲染成什么样子的 HTML 标签。
- **本文件中的代码**：
  ```typescript
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span", // 渲染为 <span> 标签
      mergeAttributes( // 将多路来源的属性（attributes）合并在一起
        {
          "data-type": "image-tag", // 必须写！否则将来 parseHTML 就认不出它了
          class: "image-tag",
          contenteditable: "false", // 防止用户把光标卡进标签内部强行修改文字
          draggable: "true",        // 开启浏览器的原生拖拽
        },
        this.options.HTMLAttributes, // 合并前面讲到的 addOptions 传进来的全局样式配置
        HTMLAttributes,              // 融合系统自动传递下来的（包含解析好的 data-image-id 等）节点级动态属性
      ),
      node.attrs.label, // 这是 span 内部的文本内容，比如显示 "赛博朋克"
    ];
  }
  ```

---

### 11. `parseText()`（JSON -> Text）

- **作用** 导出为什么样的文本

### 12. `addCommands()`（命令集合）

在 Tiptap 中，一切对编辑器内容的修改、光标的移动、格式的变换，甚至内部状态的更新，都必须通过 Command 来完成。 addCommands 的作用，就是让你把自己写的“自定义动作”注册到编辑器的全局命令库里（比如 editor.commands.insertImageTag() ），供外部 React 组件调用。

ProseMirror（Tiptap 的底层）是完全**不可变（Immutable）和事务驱动（Transaction-based）**的。三个概念：

1. state (EditorState) 代表了编辑器在这一毫秒内的完整静态快照。包含了整棵文档树（state.doc）、当前光标的选中区域（state.selection）、各个插件的当前状态等。
2. tr (Transaction) 事务，它是一个“意图”对象。你不能直接修改 state，你必须创建一个 tr，描述你想要做什么（比如“在光标位置插入一个图片节点”），然后把这个 tr 提交给编辑器。
3. dispatch(tr) 提交事务，编辑器接收到 tr 后，会根据这个事务生成一个新的 state，并触发视图更新。

Commands 系统内部封装了常用的行为，简化底层 transaction + dispatch 操作。当需要对文档进行复杂操作时，可以直接使用 transaction + dispatch。

1. 第一个insertImageTag命令，就是调用内置的 insertContent 命令来插入一个当前节点
2. removeImageTag 命令需要找到编辑器中的自定义节点，并删除。
3. setImageTagDeleteHandler 命令是用来设置删除回调

### 13. `addKeyboardShortcuts()`（键盘快捷键）

可以向编辑器注册快捷键，返回一个对象，键是快捷键，值是回调函数。

可以直接讲单个键作为 key，如 `"Backspace"`，也可以是组合键，如 `"Shift-Backspace"`。

### 14. `addNodeView()`（自定义节点视图）

addNodeView 是用来自定节点 UI 的，我们在这里使用 DOM API 创建节点，并绑定方法在拖拽时将克隆节点来自定义拖拽图像这样就可以自定义图像位置。

可以不自定义，默认使用 renderHTML。但是就不能绑定事件，也不能自定义 UI，只能渲染为简单的 HTML 嵌套，如果是复杂的图表、视频播放器就抓瞎了。

### 15. `addProseMirrorPlugins()`（ProseMirror 插件）

如何理解 Decoration ？

在不修改底层真实数据 Schema 的前提下，修改 UI。它有三种形态：

1. `Decoration.widget(pos, dom)` (挂件)：
   作用：在文档的某个精确坐标（pos）处，无中生有地硬塞进一个真实的 DOM 元素。
   特点：光标无法进入它，它不占用任何正式字符长度。
   你在代码中看到的：image-tag-inline-gap（间隙空隙）和 image-tag-drop-indicator（拖拽落点指示线）都是 Widget。它们只存在于屏幕上，用 editor.getHTML() 是绝对拿不到它们的。
2. `Decoration.inline(from, to, attributes)` (行内包裹)：
   作用：给从 from 到 to 位置的文字，强行套上一层衣服（比如 style="background: yellow"）。常用于：多人协同光标、搜索关键词高亮、拼写错误红波浪线。
3. `Decoration.node(from, to, attributes)` (节点修饰)：
   作用：给整块特定的 Node 添加 class 或属性。常用于：选中某个卡片时，让卡片有个蓝色的发光边框。

如何理解 setMeta 与 getMeta?

因为插件的状态（Plugin State）不属于文档数据（Schema / Doc），所以不能用普通的事务（只能操作 Schema）来修改，可以创建一个空事务，并通过 setMeta 来让事务携带额外的 meta 信息。dispatch 事务后，所有插件的 apply 方法都会被自动调用。

补充：EditorState 的结构

1. state.doc：根据 Schema 严格校验出来的树状数据结构（也就是你最终存进数据库的 JSON 内容）。
2. state.selection：光标。记录当前用户的选中区域。
3. 各个 Plugin 的 State：场外信息。
