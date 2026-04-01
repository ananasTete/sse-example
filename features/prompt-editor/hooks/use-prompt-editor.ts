import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { type CropMetadata, type PromptData, type PromptImage } from "../types";
import {
  fileToDataUrl,
  generateId,
  getPromptImages,
  promptToContent,
  serializePromptData,
} from "../utils";

export interface UsePromptEditorOptions {
  editor: Editor | null;
  maxImages?: number;
}

export interface UsePromptEditorReturn {
  images: PromptImage[];
  addImages: (files: File[]) => Promise<void>;
  replaceImage: (id: string, file: File) => Promise<void>;
  removeImage: (id: string) => void;
  setImageCrop: (id: string, crop?: CropMetadata) => void;
  canAddMore: boolean;
  getPromptData: () => PromptData;
  setPromptData: (data: PromptData) => void;
}

const MOCK_UPLOAD_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function mockUploadImage(file: File): Promise<string> {
  await sleep(MOCK_UPLOAD_DELAY_MS);
  return fileToDataUrl(file);
}

export function usePromptEditor({
  editor,
  maxImages = 4,
}: UsePromptEditorOptions): UsePromptEditorReturn {
  const [images, setImages] = useState<PromptImage[]>([]);

  useEffect(() => {
    if (!editor) {
      setImages([]);
      return;
    }

    const syncImages = () => {
      setImages(getPromptImages(editor.state.doc));
    };

    syncImages();
    editor.on("transaction", syncImages);

    return () => {
      editor.off("transaction", syncImages);
    };
  }, [editor]);

  const canAddMore = images.length < maxImages;

  const getNextLabelIndexes = useCallback(
    (count: number) => {
      const usedIndexes = new Set(images.map((image) => image.index));
      const nextIndexes: number[] = [];
      let nextIndex = 1;

      while (nextIndexes.length < count) {
        if (!usedIndexes.has(nextIndex)) {
          usedIndexes.add(nextIndex);
          nextIndexes.push(nextIndex);
        }

        nextIndex += 1;
      }

      return nextIndexes;
    },
    [images],
  );

  // 添加图片并设置到编辑器
  const addImages = useCallback(
    async (files: File[]) => {
      if (!editor) return;

      const remainingSlots = maxImages - getPromptImages(editor.state.doc).length;
      const acceptedFiles = files.slice(0, Math.max(remainingSlots, 0));
      if (acceptedFiles.length === 0) {
        return;
      }

      const labelIndexes = getNextLabelIndexes(acceptedFiles.length);
      const placeholders = acceptedFiles.map((file, index) => {
        const labelIndex = labelIndexes[index];

        return {
          file,
          image: {
            id: generateId(),
            label: `图${labelIndex}`,
            index: labelIndex,
            url: null,
            status: "uploading" as const,
          },
        };
      });

      // 先更新注册表
      const chain = editor.chain().focus().upsertPromptImages(
        placeholders.map(({ image }) => image),
      );

      // 插入节点
      placeholders.forEach(({ image }) => {
        chain.insertImageTag({ imageId: image.id, label: image.label });
      });

      chain.run();

      await Promise.allSettled(
        placeholders.map(async ({ file, image }) => {
          try {
            const url = await mockUploadImage(file);
            editor.commands.updatePromptImage(image.id, {
              url,
              status: "ready",
              metadata: undefined,
            });
          } catch {
            editor.commands.removePromptImagesAndTags([image.id]);
          }
        }),
      );
    },
    [editor, getNextLabelIndexes, maxImages],
  );

  // 删除图片
  const removeImage = useCallback(
    (id: string) => {
      if (!editor) return;

      editor.commands.removePromptImagesAndTags([id]);
    },
    [editor],
  );

  // 替换图片
  const replaceImage = useCallback(
    async (id: string, file: File) => {
      if (!editor) {
        return;
      }

      const currentImage = getPromptImages(editor.state.doc).find(
        (image) => image.id === id,
      );
      if (!currentImage || currentImage.status !== "ready") {
        return;
      }

      editor.commands.updatePromptImage(id, {
        url: null,
        status: "uploading",
      });

      try {
        const nextUrl = await mockUploadImage(file);
        editor.commands.updatePromptImage(id, {
          url: nextUrl,
          status: "ready",
          metadata: undefined,
        });
      } catch {
        editor.commands.updatePromptImage(id, currentImage);
      }
    },
    [editor],
  );

  const setImageCrop = useCallback(
    (id: string, crop?: CropMetadata) => {
      if (!editor) {
        return;
      }

      editor.commands.setPromptImageCrop(id, crop);
    },
    [editor],
  );

  // 获取 prompt 数据用于提交
  const getPromptData = useCallback((): PromptData => {
    if (!editor) {
      return {
        prompt: "",
        images: [],
      };
    }

    return serializePromptData(editor.state.doc);
  }, [editor]);

  // 设置 prompt 数据用于回显
  const setPromptData = useCallback(
    (data: PromptData) => {
      if (!editor) return;

      editor.commands.setContent(promptToContent(data.prompt, data.images));
    },
    [editor],
  );

  return {
    images,
    addImages,
    replaceImage,
    removeImage,
    setImageCrop,
    canAddMore,
    getPromptData,
    setPromptData,
  };
}

export default usePromptEditor;
