## 需求

图片上传：

1. 限制上传数量、质量
2. 为每个图片指定图片 1、图片 2、图片 3等名称。删除图片 2，图片 3 不会变为图片 2，下次上传图片使用图片 2。
3. 支持重新上传图片替换图片 n
4. 裁切图片：特定比例如 1:1、16:9 或者手动拖拽设置大小

图片与编辑器联动：

1. 上传图片，编辑器出现TAG
2. 删除图片，编辑器自动删除 TAG
3. 编辑器删除 TAG，如果这是编辑器中最后一个表示某个图片的 TAG 则弹窗确认，否则直接删除

编辑器：

1. TAG 可拖拽改变位置、拖拽时缩略图展示在鼠标指针下方，不影响用户查看光标位置、TAG 两侧与文本之间留有间距增加可读性
2. 输入 @ 触发气泡菜单，支持鼠标和键盘选择图片

## 实现

### use-prompt-images

- 维护一个图片列表，每个图片包含 id、label、url、status
- 实现图片数据的增删改查

### use-prompt-editor

- 维护一个编辑器实例
- 实现编辑器 TAG 的增删改查

```
UI -> use-prompt-editor -> use-prompt-images
```

### 本地数据结构

```typescript
export interface PromptImage {
  id: string;
  url: string | null;
  label: string;
  index: number;
  status: PromptImageStatus;
  metadata?: PromptImageMetadata;
}
```

### 提交后端结构

```
{
  "prompt": "[@图1]走在人来人往的斑马线上，天空在下雨",
  "images": [
    {
      "id": "img-67d38160-16b6-44e5-8c71-0025d117dae3",
      "label": "图1",
      "url": "xxxx",
      "index": 1
    }
  ]
}
```

- prompt：用来喂给大模型的
- images：图片数据

在回显时根据 prompt 和 images 数据，解析为编辑器的 json 数据，再给 tiptap 渲染。

### TAG 两侧间距与末尾光标

问题现象：

- 希望 TAG 左右和文本之间有一点空隙，提升可读性。
- 当 TAG 是段落最后一个节点时，点击 TAG 右侧末尾区域，光标会被 TAG 右边框盖住。

原来的方案为什么不行：

- 一开始尝试过用 `.image-tag::before` / `.image-tag::after` 在 TAG 内部制造左右空白。这种空白属于 TAG 盒子内部，不是编辑器真正的可编辑位置。
- 后来改成 `margin-inline` 让 TAG 和文本分开。这个方案在视觉上有间距，但 `margin` 仍然不是 ProseMirror 文档中的真实位置。
- 所以当 TAG 位于段落末尾时，用户点击到“右侧空白”区域，浏览器会先命中视觉 margin，随后 ProseMirror 会把 selection 校正到“节点后位置”，最终光标还是贴回 TAG 边框，看起来像右侧没有间距。最终呈现光标位置闪烁问题。

最终解决方案：

- 保留 `imageTag` 为原子 inline 节点，并显式设置 `contenteditable="false"`，避免浏览器把光标放进 TAG 盒子内部。
- 不再依赖伪元素或 `margin` 提供间距，而是在 ProseMirror 插件里通过 `Decoration.widget` 给 TAG 左右插入真实的 inline gap。
- gap 的宽度按相邻关系区分：
  - TAG 与普通文本相邻时，插入一个完整 gap。
  - 两个 TAG 相邻时，不再直接叠加两个完整 gap，而是左侧 TAG 右边放 `1/2 gap`，右侧 TAG 左边再放 `1/2 gap`。视觉上仍然是一个完整间距，但光标可以稳定落在两个半 gap 之间。
- 这些 gap 是编辑器布局的一部分，不只是视觉样式，因此点击最后一个 TAG 右侧时，光标可以落在 gap 后面，末尾交互会稳定很多。
- gap 自身只提供横向宽度，不参与垂直高度计算，避免把所在段落的行高继续撑高。

结论：

- “视觉间距”和“可编辑光标落点”在 TipTap / ProseMirror 里不是一回事。
- 只要需求包含“末尾可点击的空白区域”，就不能只用 CSS `margin` 或伪元素，必须提供真实的 inline 可布局节点。
