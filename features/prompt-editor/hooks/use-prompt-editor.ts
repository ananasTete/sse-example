"use client";

import { useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/core";

export interface PromptImage {
  id: string;
  url: string;
  file?: File;
  label: string;
}

export interface PromptData {
  text: string;
  images: { label: string; url: string }[];
}

function parseTextToContent(
  text: string,
  labelToIdMap: Map<string, string>,
): any {
  const tagPattern = /\[@(图\d+)\]/g;
  const content: any[] = [];
  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      content.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    const label = match[1];
    const imageId = labelToIdMap.get(label);
    if (imageId) {
      content.push({
        type: "imageTag",
        attrs: { imageId, label },
      });
    } else {
      content.push({ type: "text", text: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    content.push({ type: "text", text: text.slice(lastIndex) });
  }

  if (content.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return {
    type: "doc",
    content: [{ type: "paragraph", content }],
  };
}

interface PendingDelete {
  imageId: string;
  label: string;
  resolve: (confirmed: boolean) => void;
}

export interface UsePromptEditorOptions {
  editor: Editor | null;
  maxImages?: number;
}

export interface UsePromptEditorReturn {
  images: PromptImage[];
  addImage: (file: File) => void;
  removeImage: (id: string) => void;
  pendingDelete: PendingDelete | null;
  confirmDelete: () => void;
  cancelDelete: () => void;
  onBeforeTagDelete: (imageId: string) => Promise<boolean>;
  canAddMore: boolean;
  getPromptData: () => PromptData;
  setPromptData: (data: PromptData) => void;
}

export function usePromptEditor({
  editor,
  maxImages = 4,
}: UsePromptEditorOptions): UsePromptEditorReturn {
  const [images, setImages] = useState<PromptImage[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const usedLabelsRef = useRef<Set<number>>(new Set());

  const generateId = () =>
    `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const findNextLabelNum = () => {
    let num = 1;
    while (usedLabelsRef.current.has(num)) {
      num++;
    }
    return num;
  };

  const extractLabelNum = (label: string): number | null => {
    const match = label.match(/^图(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  };

  const addImage = useCallback(
    (file: File) => {
      if (!editor || images.length >= maxImages) return;

      const labelNum = findNextLabelNum();
      usedLabelsRef.current.add(labelNum);
      const label = `图${labelNum}`;
      const id = generateId();
      const url = URL.createObjectURL(file);

      const newImage: PromptImage = { id, url, file, label };
      setImages((prev) => [...prev, newImage]);

      editor.chain().focus().insertImageTag({ imageId: id, label }).run();
    },
    [editor, images.length, maxImages],
  );

  const removeImage = useCallback(
    (id: string) => {
      if (!editor) return;

      setImages((prev) => {
        const image = prev.find((img) => img.id === id);
        if (image) {
          URL.revokeObjectURL(image.url);
          const labelNum = extractLabelNum(image.label);
          if (labelNum !== null) {
            usedLabelsRef.current.delete(labelNum);
          }
        }
        return prev.filter((img) => img.id !== id);
      });

      editor.commands.removeImageTag(id);
    },
    [editor],
  );

  const onBeforeTagDelete = useCallback(
    (imageId: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const image = images.find((img) => img.id === imageId);
        const label = image?.label || "图片";
        setPendingDelete({ imageId, label, resolve });
      });
    },
    [images],
  );

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;

    setImages((prev) => {
      const image = prev.find((img) => img.id === pendingDelete.imageId);
      if (image) {
        URL.revokeObjectURL(image.url);
        const labelNum = extractLabelNum(image.label);
        if (labelNum !== null) {
          usedLabelsRef.current.delete(labelNum);
        }
      }
      return prev.filter((img) => img.id !== pendingDelete.imageId);
    });

    pendingDelete.resolve(true);
    setPendingDelete(null);
  }, [pendingDelete]);

  const cancelDelete = useCallback(() => {
    if (!pendingDelete) return;
    pendingDelete.resolve(false);
    setPendingDelete(null);
  }, [pendingDelete]);

  const getPromptData = useCallback((): PromptData => {
    const text = editor?.getText() || "";
    const imageData = images.map((img) => ({
      label: img.label,
      url: img.url,
    }));
    return { text, images: imageData };
  }, [editor, images]);

  const setPromptData = useCallback(
    (data: PromptData) => {
      if (!editor) return;

      usedLabelsRef.current.clear();
      const labelToIdMap = new Map<string, string>();
      const newImages: PromptImage[] = [];

      /**
       * 遍历数组重建 usedLabelsRef、newImages
       *
       * 新建 labelToIdMap 用于 parseTextToContent 将文本转换为 TipTap JSON 内容，建立图片和标签之间的连接
       */

      data.images.forEach((img) => {
        const id = generateId();
        const labelNum = extractLabelNum(img.label);
        if (labelNum !== null) {
          usedLabelsRef.current.add(labelNum);
        }
        labelToIdMap.set(img.label, id);
        newImages.push({ id, url: img.url, label: img.label });
      });

      setImages(newImages);

      const content = parseTextToContent(data.text, labelToIdMap);
      console.log(1, content);
      editor.commands.setContent(content);
    },
    [editor],
  );

  return {
    images,
    addImage,
    removeImage,
    pendingDelete,
    confirmDelete,
    cancelDelete,
    onBeforeTagDelete,
    canAddMore: images.length < maxImages,
    getPromptData,
    setPromptData,
  };
}

export default usePromptEditor;
