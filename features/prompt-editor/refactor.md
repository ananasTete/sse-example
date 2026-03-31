唯一最好的方案，是把 **ProseMirror 文档本身** 设计成完整的 prompt 状态容器：

- 文档里有一份唯一的图片注册表
- 行内 `imageTag` 只保存 `imageId`
- React 不再持有独立的 `images` 真相，只做文档投影
- 所有图片相关操作都必须走 editor command / transaction

这不是“最小改动”，但这是这类编辑器里最干净、最稳定、后续最不容易反噬的方案。

**为什么这是唯一最好的方案**

你现在的问题，本质不是“cleanup 写漏了几个入口”，而是状态分散：

- 文档里有 tag
- React 里有 images
- 两边靠事件同步

只要两边不是同一个事务系统，迟早就会分叉。  
所以真正的解法不是补同步，而是**消灭双真相**。

但这里还有一个关键校正：

文档作为唯一事实来源，不等于“把整份图片数据复制到每个 `imageTag.attrs`”。

那样只是把双真相，变成了**文档内部的多份重复真相**。同一张图出现两次，就会有两份 `url`、两份 metadata、两份未来可能不一致的数据。这不是最佳实践。

最佳实践是：

- 图片实体只存一份
- tag 只是引用这份实体

这和数据库设计是一样的。  
`imageTag` 是外键，不是整行记录。

**推荐的数据模型**

在当前项目约束下，最合适的是在文档里加一个顶层 `imageRegistry` 节点，里面保存唯一一份图片数组。因为你这里 `maxImages` 只有 4，这样做足够简单，也不会有性能问题。

文档结构建议变成这样：

```ts
type PromptDoc = {
  type: "doc";
  content: [
    {
      type: "imageRegistry";
      attrs: {
        items: Array<{
          id: string;
          label: string;
          index: number;
          status: "uploading" | "ready";
          url: string | null;
          metadata?: PromptImageMetadata;
        }>;
      };
    },
    ...paragraphs,
  ];
};
```

而 `imageTag` 只保留：

```ts
{
  type: "imageTag",
  attrs: {
    imageId: string;
  }
}
```

这就是唯一正确的职责分离：

- `imageRegistry` 负责图片实体
- `imageTag` 负责文档中的引用位置
- React 负责把它们读出来显示，不再自己存一份真相

**为什么不把 `label/url/metadata` 都塞进 `imageTag.attrs`**

因为那会让你得到三个新问题：

1. 同一张图被引用两次，实体数据重复两次
2. 替换图片或裁剪图片时，要更新所有 tag
3. `url` 现在还是 `dataUrl`，会把文档和 history 膨胀得很难看

所以最好的方案不是“所有信息进 tag”，而是“所有信息进文档，但只存一份”。

**行为应该怎么闭环**

这套模型下，所有操作都变得非常清楚。

添加图片时：

1. command 往 `imageRegistry` 里插入一条图片记录，初始 `status=uploading`
2. 同一个 transaction 在光标位置插入一个 `imageTag(imageId)`
3. 上传完成后，再通过 command 更新 registry 里的那一条记录，把 `url/status/metadata` 写回文档

删除 tag 时：

- 只是普通文档编辑，删掉 `imageTag`

但文档里还要有一个规范化规则：

- 每次 transaction 结束后，检查 registry 中哪些图片已经没有任何 tag 引用
- 自动把这些未引用图片从 registry 中移除

这一步建议放在 ProseMirror 插件的 `appendTransaction` 里做，而不是放在键盘事件里做。

这样它覆盖的是所有路径：

- Backspace/Delete
- 输入覆盖选区
- 粘贴覆盖
- cut
- setContent
- undo/redo
- 将来协同编辑

而且由于 registry 也在文档里，这个清理动作仍然属于编辑器事务系统，不再是 React 的“场外副作用”。

替换图片、裁剪图片时：

- 不碰 tag
- 只更新 registry 中对应 `imageId` 的记录

删除图片卡片时：

- 不再先删 React state
- 直接走一个 editor command：
  - 删除 registry 对应图片
  - 删除所有引用该 `imageId` 的 tag

这是一个完整的文档事务，所以撤销也天然正确。

**React 层应该退到什么位置**

React 不再维护 `images` 状态。  
[use-prompt-editor.ts](/Users/joinu/Desktop/sse-example/features/prompt-editor/hooks/use-prompt-editor.ts) 应该改成“选择器 + 命令封装”层，而不是状态源。

它只做三件事：

1. 从 `editor.state.doc` 读取 `imageRegistry.items`
2. 从 `editor.state.doc` 收集当前 tag 的引用关系
3. 暴露对 editor commands 的调用

比如：

- `images = selectImagesFromDoc(editor.state.doc)`
- `referencedIds = selectReferencedImageIds(editor.state.doc)`
- 面板展示数据 = registry 和引用关系的派生结果

这时 React 就只是视图层，不再是业务真相层。

**导出和回显也要一起改**

你现在 [use-prompt-editor.ts](/Users/joinu/Desktop/sse-example/features/prompt-editor/hooks/use-prompt-editor.ts) 里用的是 `editor.getText()`。  
在最佳方案下，这不够了，因为 `imageTag` 只存 `imageId`，文本导出必须通过 registry 解析出 `[@图1]`。

所以要新增一套显式序列化器：

- `serializePromptDoc(doc) -> PromptData`
- `deserializePromptData(data) -> JSONContent`

不要再依赖通用的 `getText()` 来承担业务序列化职责。  
这是最佳实践，不是额外复杂度，而是把“编辑器文本提取”和“业务导出格式”分开。

**落到这个仓库，应该改哪些地方**

需要重构这几个位置：

- [image-tag.ts](/Users/joinu/Desktop/sse-example/features/prompt-editor/extensions/image-tag.ts)
  改成纯引用节点，只保留 `imageId`，移除 `onCleanupImages`、`setImageTagCleanupHandler` 和删除副作用。

- 新增一个 `image-registry` extension
  持有唯一图片实体列表，并提供更新 command。

- [use-prompt-editor.ts](/Users/joinu/Desktop/sse-example/features/prompt-editor/hooks/use-prompt-editor.ts)
  不再维护 `images` 为 source of truth，只负责从文档选择数据和调用 command。

- [use-prompt-images.ts](/Users/joinu/Desktop/sse-example/features/prompt-editor/hooks/use-prompt-images.ts)
  拆掉状态管理职责，只保留上传能力，或者改成服务函数。

- [utils.ts](/Users/joinu/Desktop/sse-example/features/prompt-editor/utils.ts)
  重写 `promptToContent` 和导出逻辑，围绕“registry + tag 引用”做序列化/反序列化。

**一句话定论**

最好的方案不是“继续同步 React state 和文档”，也不是“把整份图片数据复制到每个 tag 上”。  
最好的方案是：

**把图片实体和 tag 引用都收回到同一个 ProseMirror 文档里，实体只存一份，引用只存 `imageId`，React 只做派生视图，所有变更全部走 transaction。**

这套方案做完，删除、撤销、重做、覆盖输入、程序化更新，都会自然正确。  
这是唯一真正收敛问题面的方案。

如果你要，我下一步就直接按这个方案，给你拆成具体的重构步骤和代码改造顺序。
