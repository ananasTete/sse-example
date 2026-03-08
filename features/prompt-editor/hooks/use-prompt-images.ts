import { useState, useCallback, useRef } from "react";
import type { CropMetadata, PromptImage } from "../types";
import { fileToDataUrl, generateId } from "../utils";

export interface UsePromptImagesOptions {
  maxImages?: number;
}

export interface UsePromptImagesReturn {
  images: PromptImage[];
  setImages: React.Dispatch<React.SetStateAction<PromptImage[]>>;
  canAddMore: boolean;
  addImages: (
    files: File[],
    onInsertTags?: (images: PromptImage[]) => void,
  ) => Promise<void>;
  replaceImage: (id: string, file: File) => Promise<void>;
  removeImageState: (id: string) => void;
  resetImages: (newImages: PromptImage[]) => void;
  setImageCrop: (id: string, crop?: CropMetadata) => void;
  imagesRef: React.MutableRefObject<PromptImage[]>;
}

const MOCK_UPLOAD_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function mockUploadImage(file: File): Promise<string> {
  await sleep(MOCK_UPLOAD_DELAY_MS);
  return fileToDataUrl(file);
}

export function usePromptImages({
  maxImages = 4,
}: UsePromptImagesOptions = {}): UsePromptImagesReturn {
  const [images, setImages] = useState<PromptImage[]>([]);
  const imagesRef = useRef<PromptImage[]>([]);
  const pendingAddCountRef = useRef(0);
  const usedLabelsRef = useRef<Set<number>>(new Set()); // 使用 Set 记录使用过的序号

  const syncImages = useCallback((nextImages: PromptImage[]) => {
    imagesRef.current = nextImages;
    setImages(nextImages);
  }, []);

  // 计算序号
  const findNextLabelIndex = () => {
    let index = 1;
    while (usedLabelsRef.current.has(index)) {
      index++;
    }
    return index;
  };

  // 添加图片
  const addImages = useCallback(
    async (
      files: File[],
      onInsertTags?: (images: PromptImage[]) => void,
    ) => {
      if (files.length === 0) return;

      const remainingSlots =
        maxImages - imagesRef.current.length - pendingAddCountRef.current;
      const acceptedFiles = files.slice(0, Math.max(remainingSlots, 0));
      if (acceptedFiles.length === 0) return;

      pendingAddCountRef.current += acceptedFiles.length;

      const drafts = acceptedFiles.map((file) => {
        const labelIndex = findNextLabelIndex();
        usedLabelsRef.current.add(labelIndex);

        return {
          file,
          id: generateId(),
          label: `图${labelIndex}`,
          labelIndex,
        };
      });

      try {
        const placeholders: PromptImage[] = drafts.map((draft) => ({
          id: draft.id,
          label: draft.label,
          index: draft.labelIndex,
          url: null,
          status: "uploading",
        }));

        setImages((prev) => {
          const merged = [...prev, ...placeholders];
          imagesRef.current = merged;
          return merged;
        });

        await Promise.allSettled(
          drafts.map(async (draft) => {
            try {
              const url = await mockUploadImage(draft.file);
              const currentImages = imagesRef.current;
              if (!currentImages.some((img) => img.id === draft.id)) {
                return;
              }

              const readyImage: PromptImage = {
                id: draft.id,
                label: draft.label,
                index: draft.labelIndex,
                url,
                status: "ready",
                metadata: undefined,
              };

              const nextImages = currentImages.map((img) =>
                img.id === draft.id ? readyImage : img,
              );
              syncImages(nextImages);

              onInsertTags?.([readyImage]);
            } catch {
              usedLabelsRef.current.delete(draft.labelIndex);
              const nextImages = imagesRef.current.filter(
                (img) => img.id !== draft.id,
              );
              imagesRef.current = nextImages;
              setImages(nextImages);
            }
          }),
        );
      } finally {
        pendingAddCountRef.current -= acceptedFiles.length;
      }
    },
    [maxImages],
  );

  // 替换图片
  const replaceImage = useCallback(async (id: string, file: File) => {
    const currentImage = imagesRef.current.find((img) => img.id === id);
    if (!currentImage || currentImage.status !== "ready") return;

    const loadingImage: PromptImage = {
      ...currentImage,
      url: null,
      status: "uploading",
    };

    const loadingImages = imagesRef.current.map((img) =>
      img.id === id ? loadingImage : img,
    );
    syncImages(loadingImages);

    try {
      const nextUrl = await mockUploadImage(file);
      const latestImage = imagesRef.current.find((img) => img.id === id);
      if (!latestImage) return;

      const readyImage: PromptImage = {
        ...latestImage,
        url: nextUrl,
        status: "ready",
        metadata: undefined,
      };

      const nextImages = imagesRef.current.map((img) =>
        img.id === id ? readyImage : img,
      );
      syncImages(nextImages);
    } catch {
      const restoredImages = imagesRef.current.map((img) =>
        img.id === id ? currentImage : img,
      );
      syncImages(restoredImages);
    }
  }, [syncImages]);

  // 删除图片
  const removeImageState = useCallback(
    (id: string) => {
      setImages((prev) => {
        const image = prev.find((img) => img.id === id);
        if (image) {
          usedLabelsRef.current.delete(image.index);
        }
        const filtered = prev.filter((img) => img.id !== id);
        imagesRef.current = filtered;
        return filtered;
      });
    },
    [],
  );

  // 重置图片
  const resetImages = useCallback(
    (newImages: PromptImage[]) => {
      usedLabelsRef.current.clear();
      newImages.forEach((img) => {
        if (img.index > 0) {
          usedLabelsRef.current.add(img.index);
        }
      });
      const normalizedImages = newImages.map((img) => ({
        ...img,
        status: "ready" as const,
      }));
      syncImages(normalizedImages);
    },
    [syncImages],
  );

  const setImageCrop = useCallback(
    (id: string, crop?: CropMetadata) => {
      const nextImages = imagesRef.current.map((image) => {
        if (image.id !== id) {
          return image;
        }

        if (!crop) {
          const restMetadata = { ...(image.metadata ?? {}) };
          delete restMetadata.crop;

          return {
            ...image,
            metadata:
              Object.keys(restMetadata).length > 0 ? restMetadata : undefined,
          };
        }

        return {
          ...image,
          metadata: {
            ...image.metadata,
            crop,
          },
        };
      });

      syncImages(nextImages);
    },
    [syncImages],
  );

  return {
    images,
    setImages,
    canAddMore: images.length < maxImages,
    addImages,
    replaceImage,
    removeImageState,
    resetImages,
    setImageCrop,
    imagesRef,
  };
}
