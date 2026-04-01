import { Node, mergeAttributes } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import {
  IMAGE_TAG_NODE_NAME,
  getPromptResourceMap,
  getPromptResourceToken,
} from "../utils";

export interface ImageTagOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageTag: {
      insertImageTag: (attrs: { resourceId: string }) => ReturnType;
      removeImageTag: (resourceId: string) => ReturnType;
    };
  }
}

const dropIndicatorKey = new PluginKey("imageTagDropIndicator");
const spacingDecorationKey = new PluginKey("imageTagSpacing");

function createBoundaryGapDom(
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
  className: string,
) {
  const gap = document.createElement("span");
  gap.className = className;
  gap.setAttribute("aria-hidden", "true");
  gap.contentEditable = "false";

  gap.addEventListener("mousedown", (event) => {
    event.preventDefault();

    const gapPos = typeof getPos === "function" ? getPos() : null;
    if (typeof gapPos !== "number") {
      return;
    }

    view.focus();
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, gapPos),
      ),
    );
  });

  return gap;
}

export const ImageTag = Node.create<ImageTagOptions>({
  name: IMAGE_TAG_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      resourceId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-resource-id") ??
          element.getAttribute("data-image-id"),
        renderHTML: (attributes) => ({ "data-resource-id": attributes.resourceId }),
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
      node.attrs.resourceId ?? "",
    ];
  },

  addCommands() {
    return {
      insertImageTag:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs });
        },

      removeImageTag:
        (resourceId) =>
        ({ tr, state, dispatch }) => {
          const ranges: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === this.name &&
              node.attrs.resourceId === resourceId
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
    const editor = this.editor;
    const imageTagName = this.name;

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

      const applyDomState = (currentNode: ProseMirrorNode) => {
        const resourceId = currentNode.attrs.resourceId as string | undefined;
        const resource = resourceId
          ? getPromptResourceMap(editor.state.doc).get(resourceId)
          : undefined;

        dom.textContent = resource ? getPromptResourceToken(resource) : "";
        if (resourceId) {
          dom.setAttribute("data-resource-id", resourceId);
        } else {
          dom.removeAttribute("data-resource-id");
        }
      };

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
      applyDomState(node);

      dom.addEventListener("dragstart", (event) => {
        if (event.dataTransfer) {
          const clone = dom.cloneNode(true) as HTMLElement;
          clone.style.position = "absolute";
          clone.style.top = "-1000px";
          document.body.appendChild(clone);

          event.dataTransfer.setDragImage(
            clone,
            clone.offsetWidth / 2 - 10,
            clone.offsetHeight / 2 - 10,
          );

          requestAnimationFrame(() => {
            document.body.removeChild(clone);
          });
        }
      });

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== imageTagName) {
            return false;
          }

          applyDomState(updatedNode);
          return true;
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const imageTagName = this.name;

    return [
      new Plugin({
        key: spacingDecorationKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos, parent, index) => {
              if (!parent?.isTextblock || typeof index !== "number") {
                return;
              }

              if (node.type.name === imageTagName) {
                const previousSibling = index > 0 ? parent.child(index - 1) : null;
                const nextSibling =
                  index < parent.childCount - 1 ? parent.child(index + 1) : null;
                const isPreviousTag = previousSibling?.type.name === imageTagName;
                const isNextTag = nextSibling?.type.name === imageTagName;

                if (!isPreviousTag) {
                  decorations.push(
                    Decoration.widget(
                      pos,
                      (view, getPos) =>
                        createBoundaryGapDom(
                          view,
                          getPos,
                          "image-tag-gap image-tag-gap--full image-tag-gap--before",
                        ),
                      {
                        side: 1,
                        ignoreSelection: false,
                        key: `image-tag-gap-before-${pos}`,
                      },
                    ),
                  );
                }

                if (!isNextTag) {
                  decorations.push(
                    Decoration.widget(
                      pos + node.nodeSize,
                      (view, getPos) =>
                        createBoundaryGapDom(
                          view,
                          getPos,
                          "image-tag-gap image-tag-gap--full image-tag-gap--after",
                        ),
                      {
                        side: -1,
                        ignoreSelection: false,
                        key: `image-tag-gap-after-${pos}`,
                      },
                    ),
                  );
                }

                if (isNextTag) {
                  decorations.push(
                    Decoration.widget(
                      pos + node.nodeSize,
                      (view, getPos) =>
                        createBoundaryGapDom(
                          view,
                          getPos,
                          "image-tag-gap image-tag-gap--half image-tag-gap--before",
                        ),
                      {
                        side: -1,
                        ignoreSelection: false,
                        key: `image-tag-pair-gap-left-${pos}`,
                      },
                    ),
                  );
                  decorations.push(
                    Decoration.widget(
                      pos + node.nodeSize,
                      (view, getPos) =>
                        createBoundaryGapDom(
                          view,
                          getPos,
                          "image-tag-gap image-tag-gap--half image-tag-gap--after",
                        ),
                      {
                        side: 1,
                        ignoreSelection: false,
                        key: `image-tag-pair-gap-right-${pos}`,
                      },
                    ),
                  );
                }
                return;
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
