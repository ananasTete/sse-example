"use client";

import { useRef } from "react";
import type { PromptResource } from "../types";
import { Crop, ImagePlus, LoaderCircle, RefreshCcw, X } from "lucide-react";
import { CroppedImagePreview } from "./cropped-image-preview";
import {
  getPromptResourcePreviewUrl,
  getPromptResourceToken,
} from "../utils";

export interface ImageCardListProps {
  resources: PromptResource[];
  onRemove: (id: string) => void;
  onAdd: (files: File[]) => Promise<void>;
  onReplace: (id: string, file: File) => Promise<void>;
  onCrop: (id: string) => void;
  canAddMore: boolean;
  maxImages?: number;
}

export const ImageCardList = ({
  resources,
  onRemove,
  onAdd,
  onReplace,
  onCrop,
  canAddMore,
}: ImageCardListProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);

  const handleSelectImages = () => {
    fileInputRef.current?.click();
  };

  const handleSelectReplaceImage = (id: string) => {
    replaceTargetIdRef.current = id;
    replaceInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    await onAdd(Array.from(files));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReplaceFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    const targetId = replaceTargetIdRef.current;
    if (!file || !targetId) return;

    await onReplace(targetId, file);

    replaceTargetIdRef.current = null;
    if (replaceInputRef.current) {
      replaceInputRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        onChange={handleReplaceFileChange}
        style={{ display: "none" }}
      />

      {resources.map((resource) => {
        const previewUrl = getPromptResourcePreviewUrl(resource);
        const token = getPromptResourceToken(resource);
        const canReplace = resource.kind === "local_image";

        return (
          <div
            key={resource.id}
            className="group relative aspect-square overflow-hidden border border-slate-200 bg-slate-100"
          >
            {resource.status === "ready" && previewUrl ? (
              <>
                <CroppedImagePreview
                  src={previewUrl}
                  alt={token}
                  crop={resource.transform?.crop}
                  className="h-full w-full"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/72 via-slate-950/12 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                <LoaderCircle
                  className={`size-4 ${resource.status === "uploading" ? "animate-spin" : ""}`}
                />
                <div className="text-[10px] font-medium uppercase tracking-[0.08em]">
                  {resource.status === "failed" ? "failed" : "loading"}
                </div>
              </div>
            )}

            <div className="absolute left-1.5 right-1.5 top-1.5 flex items-center justify-between opacity-0 transition duration-200 group-hover:opacity-100">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectReplaceImage(resource.id);
                  }}
                  className="flex h-7 w-7 items-center justify-center bg-black/45 text-white transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-40"
                  title="替换图片"
                  disabled={!canReplace}
                >
                  <RefreshCcw className="size-3" />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCrop(resource.id);
                  }}
                  className="flex h-7 w-7 items-center justify-center bg-black/45 text-white transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-40"
                  title="裁切图片"
                  disabled={resource.status !== "ready" || !previewUrl}
                >
                  <Crop className="size-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(resource.id);
                }}
                className="flex h-7 w-7 items-center justify-center bg-black/45 text-white transition hover:bg-black/60"
                title="删除图片"
              >
                <X className="size-3" />
              </button>
            </div>

            <div className="absolute bottom-1.5 left-1.5 bg-black/45 px-2 py-1 text-[10px] font-medium text-white">
              {token}
            </div>
          </div>
        );
      })}

      {canAddMore && (
        <button
          type="button"
          onClick={handleSelectImages}
          className="flex aspect-square flex-col items-center justify-center gap-1 border border-dashed border-slate-300 bg-slate-50 px-2 text-center transition hover:bg-white"
        >
          <ImagePlus className="size-4 text-slate-500" />
          <div className="text-[10px] text-slate-600">添加</div>
        </button>
      )}
    </div>
  );
};

export default ImageCardList;
