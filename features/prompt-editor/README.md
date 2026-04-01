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

### 架构设计

1. 最初方案的问题在于，把同一个业务事实拆成了两套独立状态：React 中的 images 数组表示图片实体，文档中的 tag 表示图片引用，在 react 端和文档端触发的增删改操作都要做两步：操作 images 数组和文档的节点来同步。
   这样会导致两个根本问题：
   - undo/redo 只能恢复文档事务，不能自动恢复 React 状态；
   - 节点删除路径远不止 Backspace/Delete，任何未覆盖的编辑路径都可能让两边状态分叉。
     所以问题本质不是某几个边界 case 没处理，而是缺少唯一事实来源。

2. 第二种思路是把每个 tag 节点本身作为唯一事实来源，让节点 attrs 携带完整图片数据，React images 只作为文档派生视图。
   这种方案在事务边界上是成立的，但数据建模不够好：同一图片被多次引用时会在多个 tag 上重复存储；替换图片、裁剪图片等实体更新也必须扇出修改所有对应 tag。

3. 最终方案是：在文档中维护一份唯一的图片注册表，通过 commands 系统暴露增删查改注册表方法。
   - 所有图片的创建、更新、删除都通过 editor commands 修改文档。
   - tag 节点只保存对图片实体的引用，通过 transaction 订阅中的 normalize 规则维护 registry 与 tag 引用的一致性。
   - React 层的 images 只是当前文档状态的派生视图，通过 transaction 订阅注册表自动更新。

这样事务边界、撤销重做、导入导出和各种删除路径才会真正统一。

#### 为什么用自定义节点的 attrs 存储图片数据?

因为 images 数据需要能被序列化 / 回显 / 撤销 / 重做，那就需要他是文档的一部分。

tiptap 中存储数据的三种方式对比：

| 维度                  | `attrs` | `plugin state` | `storage` |
| --------------------- | ------- | -------------- | --------- |
| 属于文档内容          | 是      | 否             | 否        |
| 通过 transaction 更新 | 是      | 是             | 否        |
| 可序列化导出          | 是      | 否             | 否        |
| undo/redo 一致性最好  | 是      | 视实现而定     | 否        |
| 协同编辑可同步        | 是      | 通常否         | 否        |
| 适合业务真相          | 是      | 有限           | 否        |
| 适合 UI 运行态        | 一般否  | 是             | 一般否    |
| 适合缓存/回调/桥接    | 否      | 一般否         | 是        |

场景：想要作为文档的一部分用 attrs；与外部 UI 交互用 storage；运行时状态用 plugin state

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
