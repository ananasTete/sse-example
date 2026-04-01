import { mergeAttributes, Node } from "@tiptap/core";
import { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import type { CropMetadata, PromptResource } from "../types";
import {
  findResourceRegistryPos,
  getPromptResourceMap,
  getPromptResources,
  getReferencedResourceIds,
  IMAGE_TAG_NODE_NAME,
  RESOURCE_REGISTRY_NODE_NAME,
  stripImageTagPairGapSentinels,
} from "../utils";

export interface PromptDocumentOptions {
  HTMLAttributes: Record<string, unknown>;
}

function mergePromptResources(
  currentResources: PromptResource[],
  updates: PromptResource[],
): PromptResource[] {
  if (updates.length === 0) {
    return currentResources;
  }

  const updatesById = new Map(updates.map((resource) => [resource.id, resource]));
  const nextResources = currentResources.map((resource) => {
    return updatesById.get(resource.id) ?? resource;
  });

  updates.forEach((resource) => {
    if (!currentResources.some((currentResource) => currentResource.id === resource.id)) {
      nextResources.push(resource);
    }
  });

  return nextResources;
}

function setRegistryResources(
  doc: ProseMirrorNode,
  tr: Transaction,
  resources: PromptResource[],
): boolean {
  const registryPos = findResourceRegistryPos(doc);

  if (registryPos === null) {
    return false;
  }

  const registryNode = doc.nodeAt(registryPos);
  if (!registryNode) {
    return false;
  }

  tr.setNodeMarkup(registryPos, undefined, {
    ...registryNode.attrs,
    resources,
  });

  return true;
}

function collectImageTagRanges(doc: ProseMirrorNode, ids: Set<string>) {
  const ranges: Array<{ from: number; to: number }> = [];

  doc.descendants((node, pos) => {
    if (node.type.name === RESOURCE_REGISTRY_NODE_NAME) {
      return false;
    }

    if (
      node.type.name === IMAGE_TAG_NODE_NAME &&
      typeof node.attrs.resourceId === "string" &&
      ids.has(node.attrs.resourceId)
    ) {
      ranges.push({ from: pos, to: pos + node.nodeSize });
      return false;
    }
  });

  return ranges;
}

function ensureParagraph(doc: ProseMirrorNode) {
  return doc.childCount <= 1;
}

function normalizeTextblockInlineContent(node: ProseMirrorNode): Fragment {
  const nextChildren: ProseMirrorNode[] = [];
  const { schema } = node.type;

  node.forEach((child) => {
    if (child.isText) {
      const nextText = stripImageTagPairGapSentinels(child.text ?? "");

      if (!nextText) {
        return;
      }

      nextChildren.push(
        nextText === child.text ? child : schema.text(nextText, child.marks),
      );
      return;
    }

    nextChildren.push(child);
  });

  return Fragment.fromArray(nextChildren);
}

const promptDocumentNormalizeKey = new PluginKey("promptDocumentNormalize");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    promptDocument: {
      upsertPromptResources: (resources: PromptResource[]) => ReturnType;
      updatePromptResource: (
        id: string,
        patch: Partial<PromptResource>,
      ) => ReturnType;
      removePromptResourcesAndTags: (ids: string[]) => ReturnType;
      setPromptResourceCrop: (id: string, crop?: CropMetadata) => ReturnType;
    };
  }
}

export const PromptDocument = Node.create<PromptDocumentOptions>({
  name: "doc",
  topNode: true,
  content: "resourceRegistry block+",

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

export const ResourceRegistry = Node.create<PromptDocumentOptions>({
  name: RESOURCE_REGISTRY_NODE_NAME,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      resources: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="resource-registry"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          "data-type": "resource-registry",
          hidden: "hidden",
          "aria-hidden": "true",
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  renderText() {
    return "";
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.setAttribute("data-type", "resource-registry");
      dom.hidden = true;
      dom.setAttribute("aria-hidden", "true");
      dom.contentEditable = "false";

      return { dom };
    };
  },

  addCommands() {
    return {
      upsertPromptResources:
        (resources) =>
        ({ state, tr, dispatch }) => {
          const currentResources = getPromptResources(state.doc);
          const nextResources = mergePromptResources(currentResources, resources);

          if (dispatch) {
            setRegistryResources(state.doc, tr, nextResources);
            dispatch(tr);
          }

          return true;
        },

      updatePromptResource:
        (id, patch) =>
        ({ state, tr, dispatch }) => {
          const currentResources = getPromptResources(state.doc);
          const currentResource = currentResources.find((resource) => resource.id === id);

          if (!currentResource) {
            return false;
          }

          const nextResources = currentResources.map((resource) => {
            return resource.id === id ? { ...resource, ...patch } : resource;
          });

          if (dispatch) {
            setRegistryResources(state.doc, tr, nextResources);
            dispatch(tr);
          }

          return true;
        },

      removePromptResourcesAndTags:
        (ids) =>
        ({ state, tr, dispatch }) => {
          if (ids.length === 0) {
            return true;
          }

          const idSet = new Set(ids);
          const nextResources = getPromptResources(state.doc).filter((resource) => {
            return !idSet.has(resource.id);
          });
          const ranges = collectImageTagRanges(state.doc, idSet);

          if (dispatch) {
            ranges
              .sort((a, b) => b.from - a.from)
              .forEach(({ from, to }) => {
                tr.delete(from, to);
              });

            setRegistryResources(state.doc, tr, nextResources);
            dispatch(tr);
          }

          return true;
        },

      setPromptResourceCrop:
        (id, crop) =>
        ({ state, tr, dispatch }) => {
          const currentResources = getPromptResources(state.doc);
          const currentResource = currentResources.find((resource) => resource.id === id);

          if (!currentResource) {
            return false;
          }

          const nextTransform = (() => {
            if (!crop) {
              const restTransform = { ...(currentResource.transform ?? {}) };
              delete restTransform.crop;

              return Object.keys(restTransform).length > 0
                ? restTransform
                : undefined;
            }

            return {
              ...currentResource.transform,
              crop,
            };
          })();

          const nextResources = currentResources.map((resource) => {
            return resource.id === id
              ? { ...resource, transform: nextTransform }
              : resource;
          });

          if (dispatch) {
            setRegistryResources(state.doc, tr, nextResources);
            dispatch(tr);
          }

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: promptDocumentNormalizeKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const resourceMap = getPromptResourceMap(newState.doc);
          const invalidTagRanges: Array<{ from: number; to: number }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name === RESOURCE_REGISTRY_NODE_NAME) {
              return false;
            }

            if (node.type.name !== IMAGE_TAG_NODE_NAME) {
              return;
            }

            const resourceId = node.attrs.resourceId as string | undefined;
            if (!resourceId || !resourceMap.has(resourceId)) {
              invalidTagRanges.push({ from: pos, to: pos + node.nodeSize });
              return false;
            }

            return false;
          });

          const tr = newState.tr;
          let changed = false;

          invalidTagRanges
            .sort((a, b) => b.from - a.from)
            .forEach(({ from, to }) => {
              tr.delete(from, to);
              changed = true;
            });

          const textblockReplacements: Array<{
            from: number;
            to: number;
            content: Fragment;
          }> = [];

          tr.doc.descendants((node, pos) => {
            if (!node.isTextblock || !node.inlineContent) {
              return;
            }

            const nextContent = normalizeTextblockInlineContent(node);
            if (!node.content.eq(nextContent)) {
              textblockReplacements.push({
                from: pos + 1,
                to: pos + node.nodeSize - 1,
                content: nextContent,
              });
            }

            return false;
          });

          textblockReplacements
            .sort((a, b) => b.from - a.from)
            .forEach(({ from, to, content }) => {
              tr.replaceWith(from, to, content);
              changed = true;
            });

          const currentResources = getPromptResources(tr.doc);
          const referencedResourceIds = getReferencedResourceIds(tr.doc);
          const nextResources = currentResources.filter((resource) => {
            return referencedResourceIds.has(resource.id);
          });

          if (nextResources.length !== currentResources.length) {
            setRegistryResources(tr.doc, tr, nextResources);
            changed = true;
          }

          if (ensureParagraph(tr.doc)) {
            const paragraph = tr.doc.type.schema.nodes.paragraph?.createAndFill();
            if (paragraph) {
              tr.insert(tr.doc.content.size, paragraph);
              changed = true;
            }
          }

          return changed ? tr : null;
        },
      }),
    ];
  },
});

export default PromptDocument;
