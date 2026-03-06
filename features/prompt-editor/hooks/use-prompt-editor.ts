import { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { type PromptData, type PromptImage } from "../types";
import { promptToContent } from "../utils";
import { usePromptImages } from "./use-prompt-images";

export interface UsePromptEditorOptions {
  editor: Editor | null;
  maxImages?: number;
}

export interface UsePromptEditorReturn {
  images: PromptImage[];
  addImages: (files: File[]) => Promise<void>;
  replaceImage: (id: string, file: File) => Promise<void>;
  removeImage: (id: string) => void;
  canAddMore: boolean;
  getPromptData: () => PromptData;
  setPromptData: (data: PromptData) => void;
}

export function usePromptEditor({
  editor,
  maxImages = 4,
}: UsePromptEditorOptions): UsePromptEditorReturn {
  const {
    images,
    canAddMore,
    addImages: handleAddImages,
    replaceImage: handleReplaceImage,
    removeImageState,
    resetImages,
  } = usePromptImages({ maxImages });

  // 添加图片并设置到编辑器
  const addImages = useCallback(
    async (files: File[]) => {
      if (!editor) return;

      await handleAddImages(files, (nextImages) => {
        const chain = editor.chain().focus();
        nextImages.forEach((image) => {
          chain.insertImageTag({ imageId: image.id, label: image.label });
        });
        chain.run();
      });
    },
    [editor, handleAddImages],
  );

  // 删除图片
  const removeImage = useCallback(
    (id: string) => {
      if (!editor) return;

      removeImageState(id);
      editor.commands.removeImageTag(id);
    },
    [editor, removeImageState],
  );

  // 替换图片
  const replaceImage = useCallback(
    async (id: string, file: File) => {
      await handleReplaceImage(id, file);
    },
    [handleReplaceImage],
  );

  // 获取 prompt 数据用于提交
  const getPromptData = useCallback((): PromptData => {
    const prompt = editor?.getText() ?? "";
    const imageData = images
      .filter((img): img is PromptImage & { url: string; status: "ready" } => {
        return img.status === "ready" && Boolean(img.url);
      })
      .map((img) => ({
        id: img.id,
        label: img.label,
        index: img.index,
        url: img.url,
      }));

    return {
      prompt,
      images: imageData,
    };
  }, [editor, images]);

  // 设置 prompt 数据用于回显
  const setPromptData = useCallback(
    (data: PromptData) => {
      if (!editor) return;

      const newImages: PromptImage[] = data.images.map((img) => ({
        id: img.id,
        url: img.url,
        label: img.label,
        index: img.index,
        status: "ready",
      }));

      resetImages(newImages);
      editor.commands.setContent(promptToContent(data.prompt, data.images));
    },
    [editor, resetImages],
  );

  return {
    images,
    addImages,
    replaceImage,
    removeImage,
    canAddMore,
    getPromptData,
    setPromptData,
  };
}

export default usePromptEditor;
