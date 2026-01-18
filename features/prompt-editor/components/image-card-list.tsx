"use client";

import { useRef } from "react";
import type { PromptImage } from "../hooks/use-prompt-editor";
import { Plus, X } from "lucide-react";

export interface ImageCardListProps {
  images: PromptImage[];
  onRemove: (id: string) => void;
  onAdd: (file: File) => void;
  canAddMore: boolean;
  maxImages?: number;
}

export const ImageCardList = ({
  images,
  onRemove,
  onAdd,
  canAddMore,
}: ImageCardListProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectImages = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      onAdd(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex gap-3 flex-nowrap">
      {/* 隐藏的删除表单 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {images.map((image) => (
        <div
          key={image.id}
          className="relative w-[120px] h-[120px] rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <img
            src={image.url}
            alt={image.label}
            className="w-full h-full object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(image.id);
            }}
            className="absolute top-2 right-2 w-7 h-7 bg-black/40 backdrop-blur-sm text-white rounded-full text-sm opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:scale-110"
            title="删除图片"
          >
            <X className="size-3" />
          </button>

          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-sm text-white text-xs font-medium rounded-md">
            {image.label}
          </div>
        </div>
      ))}

      {canAddMore && (
        <button
          onClick={handleSelectImages}
          className="w-[120px] h-[120px] bg-white/80 backdrop-blur-sm border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer"
        >
          <span className="text-xs text-gray-500 font-medium">添加图片</span>
        </button>
      )}
    </div>
  );
};

export default ImageCardList;
