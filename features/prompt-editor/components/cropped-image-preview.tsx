"use client";

import type { CSSProperties } from "react";
import type { CropMetadata } from "../types";

export interface CroppedImagePreviewProps {
  src: string;
  alt: string;
  crop?: CropMetadata;
  aspectRatio?: number;
  className?: string;
  imageClassName?: string;
}

function buildPreviewStyle(
  crop: CropMetadata,
): CSSProperties | null {
  const { x, y, width, height } = crop.rect;

  if (
    !crop.enabled ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return {
    position: "absolute",
    width: `${100 / width}%`,
    height: `${100 / height}%`,
    maxWidth: "none",
    left: `${-(x / width) * 100}%`,
    top: `${-(y / height) * 100}%`,
  };
}

function getCropAspectRatio(crop?: CropMetadata): number | null {
  if (!crop?.enabled || crop.rect.width <= 0 || crop.rect.height <= 0) {
    return null;
  }

  const { naturalWidth, naturalHeight } = crop.basis;
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return null;
  }

  return (naturalWidth * crop.rect.width) / (naturalHeight * crop.rect.height);
}

export const CroppedImagePreview = ({
  src,
  alt,
  crop,
  aspectRatio = 1,
  className = "",
  imageClassName = "",
}: CroppedImagePreviewProps) => {
  const previewStyle = crop ? buildPreviewStyle(crop) : null;
  const cropAspectRatio = getCropAspectRatio(crop);
  const viewportStyle: CSSProperties | undefined = cropAspectRatio
    ? cropAspectRatio >= aspectRatio
      ? {
          width: "100%",
          aspectRatio: String(cropAspectRatio),
        }
      : {
          height: "100%",
          aspectRatio: String(cropAspectRatio),
        }
    : undefined;

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`.trim()}
    >
      <div
        className="relative max-h-full max-w-full overflow-hidden"
        style={viewportStyle}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={
            previewStyle
              ? `select-none ${imageClassName}`.trim()
              : `h-full w-full object-cover select-none ${imageClassName}`.trim()
          }
          style={previewStyle ?? undefined}
        />
      </div>
    </div>
  );
};

export default CroppedImagePreview;
