"use client";

import { useRef } from "react";
import type { PromptImage } from "../types";
import { ImagePlus, LoaderCircle, RefreshCcw, X } from "lucide-react";

export interface ImageCardListProps {
  images: PromptImage[];
  onRemove: (id: string) => void;
  onAdd: (files: File[]) => Promise<void>;
  onReplace: (id: string, file: File) => Promise<void>;
  canAddMore: boolean;
  maxImages?: number;
}

export const ImageCardList = ({
  images,
  onRemove,
  onAdd,
  onReplace,
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    await onAdd(Array.from(files));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReplaceFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
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

      {images.map((image) => (
        <div
          key={image.id}
          className="group relative aspect-square overflow-hidden border border-slate-200 bg-slate-100"
        >
          {image.status === "ready" && image.url ? (
            <>
              <img
                src={image.url}
                alt={image.label}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/72 via-slate-950/12 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
              <LoaderCircle className="size-4 animate-spin" />
              <div className="text-[10px] font-medium uppercase tracking-[0.08em]">
                loading
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectReplaceImage(image.id);
            }}
            className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center bg-black/45 text-white opacity-0 transition duration-200 group-hover:opacity-100 hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-40"
            title="替换图片"
            disabled={image.status !== "ready"}
          >
            <RefreshCcw className="size-3" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(image.id);
            }}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center bg-black/45 text-white opacity-0 transition duration-200 group-hover:opacity-100 hover:bg-black/60"
            title="删除图片"
          >
            <X className="size-3" />
          </button>

          <div className="absolute bottom-1.5 left-1.5 bg-black/45 px-2 py-1 text-[10px] font-medium text-white">
            {image.label}
          </div>
        </div>
      ))}

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
