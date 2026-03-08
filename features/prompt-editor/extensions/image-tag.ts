import { Node, mergeAttributes } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ImageTagOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface ImageTagStorage {
  onBeforeDelete: ((imageId: string) => Promise<boolean>) | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageTag: {
      insertImageTag: (attrs: { imageId: string; label: string }) => ReturnType;
      removeImageTag: (imageId: string) => ReturnType;
      setImageTagDeleteHandler: (
        handler: ((imageId: string) => Promise<boolean>) | null,
      ) => ReturnType;
    };
  }
}

const dropIndicatorKey = new PluginKey("imageTagDropIndicator");
const inlineGapKey = new PluginKey("imageTagInlineGap");

export const ImageTag = Node.create<ImageTagOptions, ImageTagStorage>({
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

  addStorage() {
    return {
      onBeforeDelete: null,
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
          let found = false;
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === this.name &&
              node.attrs.imageId === imageId
            ) {
              if (dispatch) {
                tr.delete(pos, pos + node.nodeSize);
              }
              found = true;
              return false;
            }
          });
          return found;
        },

      setImageTagDeleteHandler: (handler) => () => {
        this.storage.onBeforeDelete = handler;
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    const handleDelete = async (forward: boolean) => {
      const { state, view } = this.editor;
      const { selection } = state;
      const { $from, $to, empty } = selection;

      let targetNode = null;
      let targetPos = -1;

      if (empty) {
        const node = forward ? $from.nodeAfter : $from.nodeBefore;
        if (node?.type.name === this.name) {
          targetNode = node;
          targetPos = forward ? $from.pos : $from.pos - node.nodeSize;
        }
      } else {
        state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
          if (node.type.name === this.name) {
            targetNode = node;
            targetPos = pos;
            return false;
          }
        });
      }

      if (targetNode && targetPos >= 0) {
        const imageId = targetNode.attrs.imageId;
        const onBeforeDelete = this.storage.onBeforeDelete;

        if (onBeforeDelete) {
          const confirmed = await onBeforeDelete(imageId);
          if (confirmed) {
            const tr = view.state.tr.delete(
              targetPos,
              targetPos + targetNode.nodeSize,
            );
            view.dispatch(tr);
          }
          return true;
        }
      }

      return false;
    };

    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (empty) {
          const nodeBefore = $from.nodeBefore;
          if (nodeBefore?.type.name === this.name) {
            handleDelete(false);
            return true;
          }
        } else {
          let hasImageTag = false;
          state.doc.nodesBetween(
            selection.$from.pos,
            selection.$to.pos,
            (node) => {
              if (node.type.name === this.name) {
                hasImageTag = true;
                return false;
              }
            },
          );
          if (hasImageTag) {
            handleDelete(false);
            return true;
          }
        }
        return false;
      },

      Delete: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (empty) {
          const nodeAfter = $from.nodeAfter;
          if (nodeAfter?.type.name === this.name) {
            handleDelete(true);
            return true;
          }
        }
        return false;
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
      dom.className = "image-tag";
      dom.contentEditable = "false";
      dom.draggable = true;
      dom.textContent = node.attrs.label;

      // 应用额外的 HTML 属性
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          dom.setAttribute(key, String(value));
        }
      });

      // 每次拖拽开始时设置自定义拖拽图像
      dom.addEventListener("dragstart", (e) => {
        if (e.dataTransfer) {
          const clone = dom.cloneNode(true) as HTMLElement;
          clone.style.position = "absolute";
          clone.style.top = "-1000px";
          document.body.appendChild(clone);

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

            state.doc.descendants((node, pos, parent, index) => {
              if (
                node.type.name !== imageTagName ||
                !parent?.isTextblock ||
                typeof index !== "number"
              ) {
                return;
              }

              const createGap = (size: "full" | "half") => {
                const gap = document.createElement("span");
                gap.className = `image-tag-inline-gap image-tag-inline-gap--${size}`;
                gap.setAttribute("aria-hidden", "true");
                return gap;
              };

              const previousSibling = index > 0 ? parent.child(index - 1) : null;
              const nextSibling =
                index < parent.childCount - 1 ? parent.child(index + 1) : null;

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

              if (previousSibling?.type.name === imageTagName) {
                decorations.push(
                  Decoration.widget(pos, () => createGap("half"), {
                    side: 1,
                    ignoreSelection: false,
                  }),
                );
              }

              if (nextSibling?.type.name === imageTagName) {
                decorations.push(
                  Decoration.widget(pos + node.nodeSize, () => createGap("half"), {
                    side: -1,
                    ignoreSelection: false,
                  }),
                );
              }

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
            return { pos: null };
          },
          apply(tr, value) {
            const meta = tr.getMeta(dropIndicatorKey);
            if (meta !== undefined) {
              return { pos: meta };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const { pos } = this.getState(state) || { pos: null };
            if (pos === null) return DecorationSet.empty;

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
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (pos) {
                view.dispatch(view.state.tr.setMeta(dropIndicatorKey, pos.pos));
              }
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
