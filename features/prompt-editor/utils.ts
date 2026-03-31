import type { JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { PromptData, PromptImage, PromptImageData } from "./types";

export const IMAGE_REGISTRY_NODE_NAME = "imageRegistry";
export const IMAGE_TAG_NODE_NAME = "imageTag";

export const generateId = () => `img-${crypto.randomUUID()}`; // 之后需要其他渠道的图片如主体、历史生成等，就可以给他们不同的 id 前缀。如 'object-uuid' 等用来区分

export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: IMAGE_REGISTRY_NODE_NAME,
      attrs: {
        images: [],
      },
    },
    { type: "paragraph" },
  ],
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function appendTextNodes(text: string, nodes: JSONContent[]) {
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    if (line) {
      nodes.push({ type: "text", text: line });
    }

    if (index < lines.length - 1) {
      nodes.push({ type: "hardBreak" });
    }
  });
}

function buildParagraphContent(
  text: string,
  labelToImageMap: Map<string, PromptImage>,
): JSONContent[] {
  const tagPattern = /\[@(图\d+)\]/g;
  const content: JSONContent[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendTextNodes(text.slice(lastIndex, match.index), content);
    }

    const label = match[1];
    const image = labelToImageMap.get(label);

    if (image) {
      content.push({
        type: "imageTag",
        attrs: { imageId: image.id, label: image.label },
      });
    } else {
      appendTextNodes(match[0], content);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    appendTextNodes(text.slice(lastIndex), content);
  }

  return content;
}

export function promptToContent(
  prompt: string,
  images: PromptImageData[],
): JSONContent {
  const readyImages: PromptImage[] = images.map((image) => ({
    ...image,
    status: "ready",
  }));
  const labelToImageMap = new Map<string, PromptImage>(
    readyImages.map((image) => [image.label, image]),
  );
  const paragraphs = prompt ? prompt.split("\n\n") : [""];
  const docContent = paragraphs.map((paragraph) => {
    const paragraphContent = buildParagraphContent(paragraph, labelToImageMap);

    return paragraphContent.length > 0
      ? { type: "paragraph", content: paragraphContent }
      : { type: "paragraph" };
  });

  return {
    type: "doc",
    content: [
      {
        type: IMAGE_REGISTRY_NODE_NAME,
        attrs: { images: readyImages },
      },
      ...(docContent.length > 0 ? docContent : [{ type: "paragraph" }]),
    ],
  };
}

export function findImageRegistryPos(doc: ProseMirrorNode): number | null {
  return doc.firstChild?.type.name === IMAGE_REGISTRY_NODE_NAME ? 0 : null;
}

export function getPromptImages(doc: ProseMirrorNode): PromptImage[] {
  const registryPos = findImageRegistryPos(doc);
  if (registryPos === null) {
    return [];
  }

  const registryNode = doc.nodeAt(registryPos);
  const images = registryNode?.attrs.images;

  return Array.isArray(images) ? (images as PromptImage[]) : [];
}

export function getPromptImageMap(doc: ProseMirrorNode) {
  return new Map(getPromptImages(doc).map((image) => [image.id, image]));
}

export function getReferencedImageIds(doc: ProseMirrorNode) {
  const ids = new Set<string>();

  doc.descendants((node) => {
    if (node.type.name === IMAGE_REGISTRY_NODE_NAME) {
      return false;
    }

    if (
      node.type.name === IMAGE_TAG_NODE_NAME &&
      typeof node.attrs.imageId === "string"
    ) {
      ids.add(node.attrs.imageId);
      return false;
    }
  });

  return ids;
}

function serializeInlineContent(node: ProseMirrorNode): string {
  const parts: string[] = [];

  node.forEach((child) => {
    if (child.isText) {
      parts.push(child.text ?? "");
      return;
    }

    if (child.type.name === "hardBreak") {
      parts.push("\n");
      return;
    }

    if (child.type.name === IMAGE_TAG_NODE_NAME) {
      parts.push(`[@${child.attrs.label}]`);
      return;
    }

    if (child.isLeaf) {
      parts.push(child.textContent);
      return;
    }

    parts.push(serializeInlineContent(child));
  });

  return parts.join("");
}

export function serializePrompt(doc: ProseMirrorNode): string {
  const blocks: string[] = [];

  doc.forEach((node) => {
    if (node.type.name === IMAGE_REGISTRY_NODE_NAME) {
      return;
    }

    blocks.push(serializeInlineContent(node));
  });

  return blocks.join("\n\n");
}

export function serializePromptData(doc: ProseMirrorNode): PromptData {
  const referencedImageIds = getReferencedImageIds(doc);
  const images = getPromptImages(doc)
    .filter((image): image is PromptImage & { status: "ready"; url: string } => {
      return (
        referencedImageIds.has(image.id) &&
        image.status === "ready" &&
        Boolean(image.url)
      );
    })
    .map((image) => ({
      id: image.id,
      label: image.label,
      index: image.index,
      url: image.url,
      metadata: image.metadata,
    }));

  return {
    prompt: serializePrompt(doc),
    images,
  };
}
