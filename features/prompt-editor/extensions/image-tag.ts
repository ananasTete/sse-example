import { Node, mergeAttributes } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ImageTagOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageTag: {
      insertImageTag: (attrs: { imageId: string; label: string }) => ReturnType;
      removeImageTag: (imageId: string) => ReturnType;
    };
  }
}

const dropIndicatorKey = new PluginKey("imageTagDropIndicator");
const inlineGapKey = new PluginKey("imageTagInlineGap");

export const ImageTag = Node.create<ImageTagOptions>({
  name: "imageTag",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"),
        renderHTML: (attributes) => ({ "data-image-id": attributes.imageId }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => ({ "data-label": attributes.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="image-tag"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-type": "image-tag",
          class: "image-tag",
          contenteditable: "false",
          draggable: "true",
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return `[@${node.attrs.label}]`;
  },

  addCommands() {
    return {
      insertImageTag:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs });
        },

      removeImageTag:
        (imageId) =>
        ({ tr, state, dispatch }) => {
          const ranges: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === this.name &&
              node.attrs.imageId === imageId
            ) {
              ranges.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          if (dispatch) {
            ranges
              .sort((a, b) => b.from - a.from)
              .forEach(({ from, to }) => {
                tr.delete(from, to);
              });
          }

          return ranges.length > 0;
        },
    };
  },

  addNodeView() {
    return ({
      node,
      HTMLAttributes,
    }: {
      node: ProseMirrorNode;
      HTMLAttributes: Record<string, unknown>;
    }) => {
      const dom = document.createElement("span");
      dom.setAttribute("data-type", "image-tag");
      dom.contentEditable = "false";
      dom.draggable = true;
      dom.textContent = node.attrs.label;

      // 应用额外的 HTML 属性
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key === "class") {
            return;
          }
          dom.setAttribute(key, String(value));
        }
      });

      const className = [dom.className, "image-tag", String(HTMLAttributes.class ?? "")]
        .filter(Boolean)
        .join(" ");
      dom.className = className;

      // 每次拖拽开始时设置自定义拖拽图像
      dom.addEventListener("dragstart", (e) => {
        if (e.dataTransfer) {
          // 创建一个 clone dom 作为拖拽图像
          const clone = dom.cloneNode(true) as HTMLElement;
          clone.style.position = "absolute";
          clone.style.top = "-1000px";
          document.body.appendChild(clone);

          // 设置拖坏图像位置，默认与指针对齐，这里放到下方，实现不遮挡目标位置的文本
          e.dataTransfer.setDragImage(
            clone,
            clone.offsetWidth / 2 - 10,
            clone.offsetHeight / 2 - 10,
          );

          requestAnimationFrame(() => {
            document.body.removeChild(clone);
          });
        }
      });

      return { dom };
    };
  },

  addProseMirrorPlugins() {
    const imageTagName = this.name;

    return [
      new Plugin({
        key: inlineGapKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            // 遍历节点
            state.doc.descendants((node, pos, parent, index) => {
              if (
                node.type.name !== imageTagName ||
                !parent?.isTextblock ||
                typeof index !== "number"
              ) {
                return;
              }
              // 创建一个 gap 元素，用来实现标签之间和标签与文本之间间距
              const createGap = (size: "full" | "half") => {
                const gap = document.createElement("span");
                gap.className = `image-tag-inline-gap image-tag-inline-gap--${size}`;
                gap.setAttribute("aria-hidden", "true");
                return gap;
              };

              const previousSibling = index > 0 ? parent.child(index - 1) : null;
              const nextSibling =
                index < parent.childCount - 1 ? parent.child(index + 1) : null;

              // 如果标签之前存在元素并且不是标签节点，则在标签前添加一个 gap
              if (
                previousSibling &&
                previousSibling.type.name !== imageTagName
              ) {
                decorations.push(
                  Decoration.widget(pos, () => createGap("full"), {
                    side: 1,
                    ignoreSelection: false,
                  }),
                );
              }

              // 如果标签之前存在元素并且是标签节点，则在标签前添加一个半宽的 gap
              if (previousSibling?.type.name === imageTagName) {
                decorations.push(
                  Decoration.widget(pos, () => createGap("half"), {
                    side: 1,
                    ignoreSelection: false,
                  }),
                );
              }

              // 如果标签后面存在元素并且是标签节点，则在标签后添加一个半宽的 gap
              if (nextSibling?.type.name === imageTagName) {
                decorations.push(
                  Decoration.widget(pos + node.nodeSize, () => createGap("half"), {
                    side: -1,
                    ignoreSelection: false,
                  }),
                );
              }

              // 如果标签后面存在元素并且不是标签节点，则在标签后添加一个 gap
              if (!nextSibling || nextSibling.type.name !== imageTagName) {
                decorations.push(
                  Decoration.widget(pos + node.nodeSize, () => createGap("full"), {
                    side: -1,
                    ignoreSelection: false,
                  }),
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
      new Plugin({
        key: dropIndicatorKey,
        state: {
          init() {
            // 初始化一个状态用来记录：现在鼠标正拖着图片在我们文档里悬停到了哪个坐标
            return { pos: null };
          },
          // 事务被 dispatch 后所有插件的 apply 都会自动执行
          apply(tr, value) {
            const meta = tr.getMeta(dropIndicatorKey);
            if (meta !== undefined) {
              // 更新状态
              return { pos: meta };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const { pos } = this.getState(state) || { pos: null };
            if (pos === null) return DecorationSet.empty;

            // 创建一个指示器元素插入记录的位置
            const widget = document.createElement("span");
            widget.className = "image-tag-drop-indicator";

            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, widget, { side: 0 }),
            ]);
          },
          handleDOMEvents: {
            dragstart: (view) => {
              view.dom.classList.add("dragging");
              return false;
            },
            dragover: (view, event) => {
              // 把鼠标所在屏幕上的坐标（clientX / Y），反向推算出文档节点里的字符数位置 pos
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (pos) {
                view.dispatch(view.state.tr.setMeta(dropIndicatorKey, pos.pos));
              }
              // 继续走浏览器默认的一些行为
              return false;
            },
            dragleave: (view) => {
              view.dispatch(view.state.tr.setMeta(dropIndicatorKey, null));
              return false;
            },
            dragend: (view) => {
              view.dom.classList.remove("dragging");
              view.dispatch(view.state.tr.setMeta(dropIndicatorKey, null));
              return false;
            },
            drop: (view) => {
              view.dom.classList.remove("dragging");
              view.dispatch(view.state.tr.setMeta(dropIndicatorKey, null));
              return false;
            },
          },
        },
      }),
    ];
  },
});

export default ImageTag;
