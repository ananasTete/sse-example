import type { JSONContent } from "@tiptap/core";
import type { PromptImageData } from "./types";

export const generateId = () => `img-${crypto.randomUUID()}`; // 之后需要其他渠道的图片如主体、历史生成等，就可以给他们不同的 id 前缀。如 'object-uuid' 等用来区分

export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
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
  labelToImageMap: Map<string, PromptImageData>,
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
  if (!prompt) {
    return EMPTY_DOC;
  }

  const labelToImageMap = new Map(images.map((image) => [image.label, image]));
  const paragraphs = prompt.split("\n\n");
  const docContent = paragraphs.map((paragraph) => {
    const paragraphContent = buildParagraphContent(paragraph, labelToImageMap);

    return paragraphContent.length > 0
      ? { type: "paragraph", content: paragraphContent }
      : { type: "paragraph" };
  });

  return {
    type: "doc",
    content: docContent.length > 0 ? docContent : EMPTY_DOC.content,
  };
}
