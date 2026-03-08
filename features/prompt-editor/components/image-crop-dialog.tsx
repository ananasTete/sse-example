"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import { Check, Crop, Trash2, X } from "lucide-react";
import type {
  CropAspectRatio,
  CropMetadata,
  CropMode,
  PromptImage,
} from "../types";
import { CroppedImagePreview } from "./cropped-image-preview";
import "./image-crop-dialog.css";
import "react-image-crop/dist/ReactCrop.css";

type ReadyPromptImage = PromptImage & { status: "ready"; url: string };

interface ImageCropDialogProps {
  open: boolean;
  image: ReadyPromptImage | null;
  onCancel: () => void;
  onApply: (id: string, crop: CropMetadata) => void;
  onClear: (id: string) => void;
}

interface RatioOption {
  label: string;
  mode: CropMode;
  aspectRatio?: CropAspectRatio;
}

const RATIO_OPTIONS: RatioOption[] = [
  { label: "自由裁剪", mode: "free" },
  { label: "16:9", mode: "aspect", aspectRatio: { x: 16, y: 9 } },
  { label: "9:16", mode: "aspect", aspectRatio: { x: 9, y: 16 } },
  { label: "4:3", mode: "aspect", aspectRatio: { x: 4, y: 3 } },
  { label: "3:4", mode: "aspect", aspectRatio: { x: 3, y: 4 } },
  { label: "1:1", mode: "aspect", aspectRatio: { x: 1, y: 1 } },
];

function toPercentCrop(crop: CropMetadata): PercentCrop {
  return {
    unit: "%",
    x: crop.rect.x * 100,
    y: crop.rect.y * 100,
    width: crop.rect.width * 100,
    height: crop.rect.height * 100,
  };
}

function buildFreeCrop(): PercentCrop {
  return buildFullCrop();
}

function buildFullCrop(): PercentCrop {
  return {
    unit: "%",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
}

function buildCenteredAspectCrop(
  aspectRatio: CropAspectRatio,
  naturalWidth: number,
  naturalHeight: number,
): PercentCrop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 82,
      },
      aspectRatio.x / aspectRatio.y,
      naturalWidth,
      naturalHeight,
    ),
    naturalWidth,
    naturalHeight,
  );
}

function buildAspectCropFromCurrent(
  currentCrop: PercentCrop | undefined,
  aspectRatio: CropAspectRatio,
  naturalWidth: number,
  naturalHeight: number,
): PercentCrop {
  if (!currentCrop?.width || !currentCrop?.height) {
    return buildCenteredAspectCrop(aspectRatio, naturalWidth, naturalHeight);
  }

  return makeAspectCrop(
    {
      unit: "%",
      x: currentCrop.x,
      y: currentCrop.y,
      width: Math.min(currentCrop.width, 90),
    },
    aspectRatio.x / aspectRatio.y,
    naturalWidth,
    naturalHeight,
  );
}

function buildInitialCrop(
  mode: CropMode,
  aspectRatio: CropAspectRatio | undefined,
  naturalWidth: number,
  naturalHeight: number,
): PercentCrop {
  if (mode === "aspect" && aspectRatio) {
    return buildCenteredAspectCrop(aspectRatio, naturalWidth, naturalHeight);
  }

  return buildFreeCrop();
}

function toCropMetadata(
  crop: PercentCrop,
  mode: CropMode,
  aspectRatio: CropAspectRatio | undefined,
  naturalSize: { width: number; height: number },
): CropMetadata {
  return {
    enabled: true,
    mode,
    aspectRatio,
    rect: {
      x: crop.x / 100,
      y: crop.y / 100,
      width: crop.width / 100,
      height: crop.height / 100,
    },
    basis: {
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
    },
  };
}

function getCropAspectRatio(crop?: CropMetadata): number {
  if (!crop?.enabled || crop.rect.width <= 0 || crop.rect.height <= 0) {
    return 1;
  }

  return (
    (crop.basis.naturalWidth * crop.rect.width) /
    (crop.basis.naturalHeight * crop.rect.height)
  );
}

export const ImageCropDialog = ({
  open,
  image,
  onCancel,
  onApply,
  onClear,
}: ImageCropDialogProps) => {
  const [crop, setCrop] = useState<PercentCrop>();
  const [mode, setMode] = useState<CropMode>("free");
  const [aspectRatio, setAspectRatio] = useState<CropAspectRatio>();
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !image) {
      setCrop(undefined);
      setMode("free");
      setAspectRatio(undefined);
      setNaturalSize(null);
      return;
    }

    const savedCrop = image.metadata?.crop;
    setMode(savedCrop?.mode ?? "free");
    setAspectRatio(savedCrop?.aspectRatio);
    setCrop(savedCrop ? toPercentCrop(savedCrop) : undefined);
    setNaturalSize(
      savedCrop
        ? {
            width: savedCrop.basis.naturalWidth,
            height: savedCrop.basis.naturalHeight,
          }
        : null,
    );
  }, [open, image]);

  const activeAspect =
    mode === "aspect" && aspectRatio
      ? aspectRatio.x / aspectRatio.y
      : undefined;

  const hasSavedCrop = Boolean(image?.metadata?.crop?.enabled);

  const applyOption = (option: RatioOption) => {
    setMode(option.mode);
    setAspectRatio(option.aspectRatio);

    if (!naturalSize) {
      return;
    }

    if (option.mode === "free") {
      setCrop((currentCrop) => currentCrop ?? buildFullCrop());
      return;
    }

    const targetAspectRatio = option.aspectRatio;
    if (!targetAspectRatio) {
      return;
    }

    setCrop((currentCrop) =>
      buildAspectCropFromCurrent(
        currentCrop,
        targetAspectRatio,
        naturalSize.width,
        naturalSize.height,
      ),
    );
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });

    if (image?.metadata?.crop) {
      setCrop(toPercentCrop(image.metadata.crop));
      return;
    }

    setCrop(buildInitialCrop(mode, aspectRatio, naturalWidth, naturalHeight));
  };

  const handleApply = () => {
    if (!image || !crop || !naturalSize) {
      return;
    }

    onApply(image.id, toCropMetadata(crop, mode, aspectRatio, naturalSize));
  };

  const handleClearCrop = () => {
    if (!image) {
      return;
    }
    onClear(image.id);
  };

  const canApply =
    Boolean(image) &&
    Boolean(naturalSize) &&
    Boolean(crop?.width) &&
    Boolean(crop?.height);

  const currentPreviewCrop =
    crop && naturalSize
      ? toCropMetadata(crop, mode, aspectRatio, naturalSize)
      : image?.metadata?.crop;
  const currentPreviewAspectRatio = getCropAspectRatio(currentPreviewCrop);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onCancel()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/28 backdrop-blur-md animate-in fade-in duration-200" />
        <div className="fixed inset-0 z-50 overflow-auto p-3 sm:p-4">
          <Dialog.Content className="image-crop-dialog mx-auto flex min-h-full w-full max-w-[820px] items-center justify-center outline-none">
            <div className="w-full overflow-hidden border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.12)] animate-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
                <Dialog.Title className="inline-flex items-center gap-2 text-sm font-medium text-slate-950">
                  <Crop className="size-4" />
                  裁切
                </Dialog.Title>

                <div className="flex items-center gap-2">
                  {hasSavedCrop ? (
                    <span className="border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700">
                      已裁切
                    </span>
                  ) : null}
                  {image ? (
                    <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                      {image.label}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex size-8 items-center justify-center border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="关闭裁切弹窗"
                >
                  <X className="size-4" />
                </button>
              </div>

              <Dialog.Description className="sr-only">
                调整图片裁切区域并应用比例。
              </Dialog.Description>

              <div className="px-3 py-3 sm:px-4">
                <div className="image-crop-stage flex w-full items-center justify-center overflow-hidden border border-slate-200 p-2 sm:p-3">
                  {image ? (
                    <ReactCrop
                      crop={crop}
                      aspect={activeAspect}
                      keepSelection
                      minWidth={64}
                      minHeight={64}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      ruleOfThirds
                    >
                      <img
                        src={image.url}
                        alt={image.label}
                        className="block max-w-full select-none"
                        draggable={false}
                        onLoad={handleImageLoad}
                      />
                    </ReactCrop>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center justify-center gap-2">
                    {image ? (
                      <button
                        type="button"
                        className="group overflow-hidden border border-sky-500 bg-white p-1 shadow-[0_0_0_1px_rgba(14,165,233,0.18)]"
                      >
                        <div
                          className="relative h-[60px] max-w-[140px] overflow-hidden bg-slate-100"
                          style={{
                            aspectRatio: String(currentPreviewAspectRatio),
                          }}
                        >
                          <CroppedImagePreview
                            src={image.url}
                            alt={image.label}
                            crop={currentPreviewCrop}
                            aspectRatio={currentPreviewAspectRatio}
                            className="h-full w-full"
                          />
                        </div>
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {RATIO_OPTIONS.map((option) => {
                      const isActive =
                        option.mode === mode &&
                        (option.mode === "free" ||
                          (option.aspectRatio?.x === aspectRatio?.x &&
                            option.aspectRatio?.y === aspectRatio?.y));

                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => applyOption(option)}
                          className={`inline-flex min-w-[88px] items-center justify-center border px-4 py-2.5 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                            isActive
                              ? "border-sky-500 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(14,165,233,0.12)]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex w-full flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleClearCrop}
                      className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:mr-auto"
                    >
                      <Trash2 className="size-3.5" />
                      清除裁剪
                    </button>
                    <button
                      type="button"
                      onClick={onCancel}
                      className="border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={!canApply}
                      className="inline-flex items-center justify-center gap-2 bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      <Check className="size-4" />
                      应用裁切
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ImageCropDialog;
