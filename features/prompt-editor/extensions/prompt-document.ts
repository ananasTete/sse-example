import { mergeAttributes, Node } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import type { CropMetadata, PromptImage } from "../types";
import {
  findImageRegistryPos,
  getPromptImageMap,
  getPromptImages,
  getReferencedImageIds,
  IMAGE_REGISTRY_NODE_NAME,
  IMAGE_TAG_NODE_NAME,
} from "../utils";

export interface PromptDocumentOptions {
  HTMLAttributes: Record<string, unknown>;
}

function mergePromptImages(
  currentImages: PromptImage[],
  updates: PromptImage[],
): PromptImage[] {
  if (updates.length === 0) {
    return currentImages;
  }

  const updatesById = new Map(updates.map((image) => [image.id, image]));
  const nextImages = currentImages.map((image) => {
    return updatesById.get(image.id) ?? image;
  });

  updates.forEach((image) => {
    if (!currentImages.some((currentImage) => currentImage.id === image.id)) {
      nextImages.push(image);
    }
  });

  return nextImages;
}

function setRegistryImages(
  doc: ProseMirrorNode,
  tr: Transaction,
  images: PromptImage[],
): boolean {
  const registryPos = findImageRegistryPos(doc);

  if (registryPos === null) {
    return false;
  }

  const registryNode = doc.nodeAt(registryPos);
  if (!registryNode) {
    return false;
  }

  tr.setNodeMarkup(registryPos, undefined, {
    ...registryNode.attrs,
    images,
  });

  return true;
}

function collectImageTagRanges(doc: ProseMirrorNode, ids: Set<string>) {
  const ranges: Array<{ from: number; to: number }> = [];

  doc.descendants((node, pos) => {
    if (node.type.name === IMAGE_REGISTRY_NODE_NAME) {
      return false;
    }

    if (
      node.type.name === IMAGE_TAG_NODE_NAME &&
      typeof node.attrs.imageId === "string" &&
      ids.has(node.attrs.imageId)
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

const promptDocumentNormalizeKey = new PluginKey("promptDocumentNormalize");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    promptDocument: {
      upsertPromptImages: (images: PromptImage[]) => ReturnType;
      updatePromptImage: (
        id: string,
        patch: Partial<PromptImage>,
      ) => ReturnType;
      removePromptImagesAndTags: (ids: string[]) => ReturnType;
      setPromptImageCrop: (id: string, crop?: CropMetadata) => ReturnType;
    };
  }
}

export const PromptDocument = Node.create<PromptDocumentOptions>({
  name: "doc",
  topNode: true,
  content: "imageRegistry block+",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

export const ImageRegistry = Node.create<PromptDocumentOptions>({
  name: IMAGE_REGISTRY_NODE_NAME,
  atom: true,
  selectable: false,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      images: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="image-registry"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          "data-type": "image-registry",
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
      dom.setAttribute("data-type", "image-registry");
      dom.hidden = true;
      dom.setAttribute("aria-hidden", "true");
      dom.contentEditable = "false";

      return { dom };
    };
  },

  addCommands() {
    return {
      upsertPromptImages:
        (images) =>
        ({ state, tr, dispatch }) => {
          const currentImages = getPromptImages(state.doc);
          const nextImages = mergePromptImages(currentImages, images);

          if (dispatch) {
            setRegistryImages(state.doc, tr, nextImages);
            dispatch(tr);
          }

          return true;
        },

      updatePromptImage:
        (id, patch) =>
        ({ state, tr, dispatch }) => {
          const currentImages = getPromptImages(state.doc);
          const currentImage = currentImages.find((image) => image.id === id);

          if (!currentImage) {
            return false;
          }

          const nextImages = currentImages.map((image) => {
            return image.id === id ? { ...image, ...patch } : image;
          });

          if (dispatch) {
            setRegistryImages(state.doc, tr, nextImages);
            dispatch(tr);
          }

          return true;
        },

      removePromptImagesAndTags:
        (ids) =>
        ({ state, tr, dispatch }) => {
          if (ids.length === 0) {
            return true;
          }

          const idSet = new Set(ids);
          const nextImages = getPromptImages(state.doc).filter((image) => {
            return !idSet.has(image.id);
          });
          const ranges = collectImageTagRanges(state.doc, idSet);

          if (dispatch) {
            ranges
              .sort((a, b) => b.from - a.from)
              .forEach(({ from, to }) => {
                tr.delete(from, to);
              });

            setRegistryImages(state.doc, tr, nextImages);
            dispatch(tr);
          }

          return true;
        },

      setPromptImageCrop:
        (id, crop) =>
        ({ state, tr, dispatch }) => {
          const currentImages = getPromptImages(state.doc);
          const currentImage = currentImages.find((image) => image.id === id);

          if (!currentImage) {
            return false;
          }

          const nextMetadata = (() => {
            if (!crop) {
              const restMetadata = { ...(currentImage.metadata ?? {}) };
              delete restMetadata.crop;

              return Object.keys(restMetadata).length > 0
                ? restMetadata
                : undefined;
            }

            return {
              ...currentImage.metadata,
              crop,
            };
          })();

          const nextImages = currentImages.map((image) => {
            return image.id === id
              ? { ...image, metadata: nextMetadata }
              : image;
          });

          if (dispatch) {
            setRegistryImages(state.doc, tr, nextImages);
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

          const imageMap = getPromptImageMap(newState.doc);
          const invalidTagRanges: Array<{ from: number; to: number }> = [];
          const labelFixes: Array<{
            pos: number;
            imageId: string;
            label: string;
          }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name === IMAGE_REGISTRY_NODE_NAME) {
              return false;
            }

            if (node.type.name !== IMAGE_TAG_NODE_NAME) {
              return;
            }

            const imageId = node.attrs.imageId as string | undefined;
            if (!imageId) {
              invalidTagRanges.push({ from: pos, to: pos + node.nodeSize });
              return false;
            }

            const image = imageMap.get(imageId);
            if (!image) {
              invalidTagRanges.push({ from: pos, to: pos + node.nodeSize });
              return false;
            }

            if (node.attrs.label !== image.label) {
              labelFixes.push({
                pos,
                imageId,
                label: image.label,
              });
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

          labelFixes.forEach(({ pos, imageId, label }) => {
            const mappedPos = tr.mapping.map(pos);
            const node = tr.doc.nodeAt(mappedPos);

            if (
              node?.type.name !== IMAGE_TAG_NODE_NAME ||
              node.attrs.imageId !== imageId ||
              node.attrs.label === label
            ) {
              return;
            }

            tr.setNodeMarkup(mappedPos, undefined, {
              ...node.attrs,
              label,
            });
            changed = true;
          });

          const currentImages = getPromptImages(tr.doc);
          const referencedImageIds = getReferencedImageIds(tr.doc);
          const nextImages = currentImages.filter((image) => {
            return referencedImageIds.has(image.id);
          });

          if (nextImages.length !== currentImages.length) {
            setRegistryImages(tr.doc, tr, nextImages);
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
