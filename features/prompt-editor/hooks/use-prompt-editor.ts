import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import type {
  CropMetadata,
  PromptPayload,
  PromptResource,
} from "../types";
import {
  fileToDataUrl,
  generateId,
  getLocalResourceSlots,
  getPromptResources,
  payloadToContent,
  serializePromptPayload,
} from "../utils";

export interface UsePromptEditorOptions {
  editor: Editor | null;
  maxImages?: number;
}

export interface UsePromptEditorReturn {
  resources: PromptResource[];
  addImages: (files: File[]) => Promise<void>;
  replaceImage: (id: string, file: File) => Promise<void>;
  removeImage: (id: string) => void;
  setImageCrop: (id: string, crop?: CropMetadata) => void;
  canAddMore: boolean;
  getPromptPayload: () => PromptPayload;
  setPromptPayload: (payload: PromptPayload) => void;
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
  const [resources, setResources] = useState<PromptResource[]>([]);

  useEffect(() => {
    if (!editor) {
      setResources([]);
      return;
    }

    const syncResources = () => {
      setResources(getPromptResources(editor.state.doc));
    };

    syncResources();
    editor.on("transaction", syncResources);

    return () => {
      editor.off("transaction", syncResources);
    };
  }, [editor]);

  const localResources = resources.filter((resource) => {
    return resource.kind === "local_image";
  });
  const canAddMore = localResources.length < maxImages;

  const getNextSlotNumbers = useCallback(
    (count: number) => {
      const usedSlots = new Set(getLocalResourceSlots(resources));
      const nextSlots: number[] = [];
      let nextSlot = 1;

      while (nextSlots.length < count) {
        if (!usedSlots.has(nextSlot)) {
          usedSlots.add(nextSlot);
          nextSlots.push(nextSlot);
        }

        nextSlot += 1;
      }

      return nextSlots;
    },
    [resources],
  );

  const addImages = useCallback(
    async (files: File[]) => {
      if (!editor) return;

      const currentLocalCount = getPromptResources(editor.state.doc).filter((resource) => {
        return resource.kind === "local_image";
      }).length;
      const remainingSlots = maxImages - currentLocalCount;
      const acceptedFiles = files.slice(0, Math.max(remainingSlots, 0));
      if (acceptedFiles.length === 0) {
        return;
      }

      const slots = getNextSlotNumbers(acceptedFiles.length);
      const placeholders = acceptedFiles.map((file, index) => {
        const slot = slots[index];

        return {
          file,
          resource: {
            id: generateId(),
            kind: "local_image" as const,
            status: "uploading" as const,
            reference: {
              type: "slot" as const,
              slot,
            },
            sourceMeta: {
              type: "local" as const,
            },
          },
        };
      });

      const chain = editor.chain().focus().upsertPromptResources(
        placeholders.map(({ resource }) => resource),
      );

      placeholders.forEach(({ resource }) => {
        chain.insertImageTag({ resourceId: resource.id });
      });

      chain.run();

      await Promise.allSettled(
        placeholders.map(async ({ file, resource }) => {
          try {
            const url = await mockUploadImage(file);
            editor.commands.updatePromptResource(resource.id, {
              asset: { url },
              status: "ready",
              transform: undefined,
            });
          } catch {
            editor.commands.removePromptResourcesAndTags([resource.id]);
          }
        }),
      );
    },
    [editor, getNextSlotNumbers, maxImages],
  );

  const removeImage = useCallback(
    (id: string) => {
      if (!editor) return;

      editor.commands.removePromptResourcesAndTags([id]);
    },
    [editor],
  );

  const replaceImage = useCallback(
    async (id: string, file: File) => {
      if (!editor) {
        return;
      }

      const currentResource = getPromptResources(editor.state.doc).find(
        (resource) => resource.id === id,
      );
      if (!currentResource || currentResource.kind !== "local_image") {
        return;
      }

      editor.commands.updatePromptResource(id, {
        asset: undefined,
        status: "uploading",
      });

      try {
        const nextUrl = await mockUploadImage(file);
        editor.commands.updatePromptResource(id, {
          asset: { url: nextUrl },
          status: "ready",
          transform: undefined,
        });
      } catch {
        editor.commands.updatePromptResource(id, currentResource);
      }
    },
    [editor],
  );

  const setImageCrop = useCallback(
    (id: string, crop?: CropMetadata) => {
      if (!editor) {
        return;
      }

      editor.commands.setPromptResourceCrop(id, crop);
    },
    [editor],
  );

  const getPromptPayload = useCallback((): PromptPayload => {
    if (!editor) {
      return {
        text: "",
        resources: [],
      };
    }

    return serializePromptPayload(editor.state.doc);
  }, [editor]);

  const setPromptPayload = useCallback(
    (payload: PromptPayload) => {
      if (!editor) return;

      editor.commands.setContent(payloadToContent(payload.text, payload.resources));
    },
    [editor],
  );

  return {
    resources,
    addImages,
    replaceImage,
    removeImage,
    setImageCrop,
    canAddMore,
    getPromptPayload,
    setPromptPayload,
  };
}

export default usePromptEditor;
