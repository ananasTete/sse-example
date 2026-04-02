import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import {
  IMAGE_TAG_NODE_NAME,
  getPromptResourceMap,
  getPromptResourceToken,
  stripImageTagPairGapSentinels,
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
const imageTagLayoutKey = new PluginKey("imageTagLayout");
const IMAGE_TAG_SELECTOR = '[data-type="image-tag"]';

function isImageTagElement(node: globalThis.Node): node is HTMLElement {
  return node instanceof HTMLElement && node.matches(IMAGE_TAG_SELECTOR);
}

function isIgnorableGapText(text: string) {
  return stripImageTagPairGapSentinels(text).length === 0;
}

function syncTextblockImageTagGaps(container: HTMLElement) {
  let previousTag: HTMLElement | null = null;

  Array.from(container.childNodes).forEach((child) => {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      if (!isIgnorableGapText(child.textContent ?? "")) {
        previousTag = null;
      }
      return;
    }

    if (!isImageTagElement(child)) {
      if (child.nodeType === globalThis.Node.ELEMENT_NODE) {
        previousTag = null;
      }
      return;
    }

    child.dataset.gapBefore = "full";
    child.dataset.gapAfter = "full";

    if (previousTag) {
      previousTag.dataset.gapAfter = "half";
      child.dataset.gapBefore = "half";
    }

    previousTag = child;
  });
}

function getImageTagLabel(
  doc: ProseMirrorNode,
  resourceId: string | null | undefined,
) {
  if (!resourceId) {
    return "";
  }

  const resource = getPromptResourceMap(doc).get(resourceId);
  return resource ? getPromptResourceToken(resource) : "";
}

function syncImageTagDom(view: EditorView) {
  const resourceMap = getPromptResourceMap(view.state.doc);
  const parents = new Set<HTMLElement>();

  view.dom.querySelectorAll<HTMLElement>(IMAGE_TAG_SELECTOR).forEach((tag) => {
    const resourceId = tag.dataset.resourceId;
    const body = tag.querySelector<HTMLElement>(".image-tag-body");
    const resource = resourceId ? resourceMap.get(resourceId) : undefined;

    if (body) {
      body.textContent = resource ? getPromptResourceToken(resource) : "";
    }

    if (tag.parentElement) {
      parents.add(tag.parentElement);
    }
  });

  parents.forEach(syncTextblockImageTagGaps);
}

function getDropIndicatorPos(view: EditorView) {
  return (
    (dropIndicatorKey.getState(view.state) as { pos: number | null } | undefined)?.pos ??
    null
  );
}

function setDropIndicatorPos(view: EditorView, pos: number | null) {
  if (getDropIndicatorPos(view) === pos) {
    return;
  }

  view.dispatch(view.state.tr.setMeta(dropIndicatorKey, pos));
}

export const ImageTag = TiptapNode.create<ImageTagOptions>({
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
        parseHTML: (element) => element.getAttribute("data-resource-id"),
        renderHTML: (attributes) => ({ "data-resource-id": attributes.resourceId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="image-tag"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const resourceId = node.attrs.resourceId as string | undefined;
    const currentDoc = this.editor?.state.doc;

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
      currentDoc ? getImageTagLabel(currentDoc, resourceId) : "",
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
      getPos,
      HTMLAttributes,
    }: {
      node: ProseMirrorNode;
      getPos: () => number | undefined;
      HTMLAttributes: Record<string, unknown>;
    }) => {
      const dom = document.createElement("span");
      const beforeGap = document.createElement("span");
      const body = document.createElement("span");
      const afterGap = document.createElement("span");

      dom.setAttribute("data-type", "image-tag");
      dom.contentEditable = "false";
      dom.draggable = true;
      beforeGap.setAttribute("data-image-tag-boundary", "before");
      beforeGap.setAttribute("aria-hidden", "true");
      beforeGap.setAttribute("role", "presentation");
      beforeGap.contentEditable = "false";
      body.className = "image-tag-body";
      body.contentEditable = "false";
      afterGap.setAttribute("data-image-tag-boundary", "after");
      afterGap.setAttribute("aria-hidden", "true");
      afterGap.setAttribute("role", "presentation");
      afterGap.contentEditable = "false";

      const baseClassName = [dom.className, "image-tag", String(HTMLAttributes.class ?? "")]
        .filter(Boolean)
        .join(" ");

      const applyDomState = (
        currentNode: ProseMirrorNode,
      ) => {
        const resourceId = currentNode.attrs.resourceId as string | undefined;

        body.textContent = getImageTagLabel(editor.state.doc, resourceId);
        if (resourceId) {
          dom.setAttribute("data-resource-id", resourceId);
        } else {
          dom.removeAttribute("data-resource-id");
        }
        dom.className = baseClassName;
        dom.dataset.gapBefore ||= "full";
        dom.dataset.gapAfter ||= "full";
        beforeGap.className = "image-tag-gap image-tag-gap--before";
        afterGap.className = "image-tag-gap image-tag-gap--after";
      };

      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key === "class") {
            return;
          }
          dom.setAttribute(key, String(value));
        }
      });

      dom.append(beforeGap, body, afterGap);

      dom.addEventListener("mousedown", (event) => {
        const target = event.target;
        const pos = getPos();
        if (!(target instanceof Element) || typeof pos !== "number") {
          return;
        }

        if (target.closest("[data-image-tag-boundary='before']")) {
          event.preventDefault();
          editor.view.focus();
          editor.view.dispatch(
            editor.state.tr
              .setSelection(TextSelection.create(editor.state.doc, pos))
              .scrollIntoView(),
          );
          return;
        }

        if (target.closest("[data-image-tag-boundary='after']")) {
          event.preventDefault();
          editor.view.focus();
          editor.view.dispatch(
            editor.state.tr
              .setSelection(TextSelection.create(editor.state.doc, pos + node.nodeSize))
              .scrollIntoView(),
          );
        }
      });

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
    return [
      new Plugin({
        key: imageTagLayoutKey,
        view(view) {
          let frameId: number | null = null;

          const scheduleDomSync = () => {
            if (frameId !== null) {
              cancelAnimationFrame(frameId);
            }

            frameId = requestAnimationFrame(() => {
              frameId = null;
              syncImageTagDom(view);
            });
          };

          scheduleDomSync();

          return {
            update(updatedView, prevState) {
              if (!updatedView.state.doc.eq(prevState.doc)) {
                scheduleDomSync();
              }
            },
            destroy() {
              if (frameId !== null) {
                cancelAnimationFrame(frameId);
              }
            },
          };
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
              const nextPos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              })?.pos ?? null;
              setDropIndicatorPos(view, nextPos);
              return false;
            },
            dragleave: (view) => {
              setDropIndicatorPos(view, null);
              return false;
            },
            dragend: (view) => {
              view.dom.classList.remove("dragging");
              setDropIndicatorPos(view, null);
              return false;
            },
            drop: (view) => {
              view.dom.classList.remove("dragging");
              setDropIndicatorPos(view, null);
              return false;
            },
          },
        },
      }),
    ];
  },
});

export default ImageTag;
