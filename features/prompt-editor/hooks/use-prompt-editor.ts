import { useCallback, useEffect, useRef, useState } from "react";
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
  replacingResourceIds: string[];
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

function getNextLocalResourceSlots(resources: PromptResource[], count: number) {
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
}

export function usePromptEditor({
  editor,
  maxImages = 4,
}: UsePromptEditorOptions): UsePromptEditorReturn {
  const [resources, setResources] = useState<PromptResource[]>([]);
  const [replacingResourceIds, setReplacingResourceIds] = useState<string[]>([]);
  const replacementOperationIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!editor) {
      setResources([]);
      setReplacingResourceIds([]);
      replacementOperationIdsRef.current.clear();
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

  const beginReplacement = useCallback((id: string) => {
    const operationId = crypto.randomUUID();
    replacementOperationIdsRef.current.set(id, operationId);
    setReplacingResourceIds((currentIds) => {
      return currentIds.includes(id) ? currentIds : [...currentIds, id];
    });

    return operationId;
  }, []);

  const endReplacement = useCallback((id: string, operationId?: string) => {
    const currentOperationId = replacementOperationIdsRef.current.get(id);
    if (operationId && currentOperationId !== operationId) {
      return false;
    }

    replacementOperationIdsRef.current.delete(id);
    setReplacingResourceIds((currentIds) => {
      return currentIds.filter((currentId) => currentId !== id);
    });

    return true;
  }, []);
  const addImages = useCallback(
    async (files: File[]) => {
      if (!editor) return;

      const currentResources = getPromptResources(editor.state.doc);
      const currentLocalCount = currentResources.filter((resource) => {
        return resource.kind === "local_image";
      }).length;
      const remainingSlots = maxImages - currentLocalCount;
      const acceptedFiles = files.slice(0, Math.max(remainingSlots, 0));
      if (acceptedFiles.length === 0) {
        return;
      }

      const slots = getNextLocalResourceSlots(currentResources, acceptedFiles.length);
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
            editor.commands.updatePromptResource(
              resource.id,
              {
                asset: { url },
                status: "ready",
                transform: undefined,
              },
              { addToHistory: false },
            );
          } catch {
            editor.commands.removePromptResourcesAndTags(
              [resource.id],
              { addToHistory: false },
            );
          }
        }),
      );
    },
    [editor, maxImages],
  );

  const removeImage = useCallback(
    (id: string) => {
      if (!editor) return;

      endReplacement(id);
      editor.commands.removePromptResourcesAndTags([id]);
    },
    [editor, endReplacement],
  );

  const replaceImage = useCallback(
    async (id: string, file: File) => {
      if (!editor) {
        return;
      }

      const currentResource = getPromptResources(editor.state.doc).find(
        (resource) => resource.id === id,
      );
      if (
        !currentResource ||
        currentResource.kind !== "local_image" ||
        currentResource.status !== "ready" ||
        !currentResource.asset?.url
      ) {
        return;
      }

      const operationId = beginReplacement(id);

      try {
        const nextUrl = await mockUploadImage(file);
        if (replacementOperationIdsRef.current.get(id) !== operationId) {
          return;
        }

        editor.commands.updatePromptResource(id, {
          asset: { url: nextUrl },
          status: "ready",
          transform: undefined,
        });
      } catch {
        // Keep the last committed image in the document on replace failure.
      } finally {
        endReplacement(id, operationId);
      }
    },
    [beginReplacement, editor, endReplacement],
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

      replacementOperationIdsRef.current.clear();
      setReplacingResourceIds([]);
      editor.commands.setContent(payloadToContent(payload.text, payload.resources));
    },
    [editor],
  );

  return {
    resources,
    replacingResourceIds,
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
