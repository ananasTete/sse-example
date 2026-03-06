import type { JSONContent } from "@tiptap/core";

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
