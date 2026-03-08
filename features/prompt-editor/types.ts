export type PromptImageStatus = "uploading" | "ready";

export type CropMode = "free" | "aspect";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropAspectRatio {
  x: number;
  y: number;
}

export interface CropMetadata {
  enabled: boolean;
  mode: CropMode;
  aspectRatio?: CropAspectRatio;
  rect: CropRect;
  basis: {
    naturalWidth: number;
    naturalHeight: number;
  };
}

export interface PromptImageMetadata {
  crop?: CropMetadata;
}

export interface PromptImage {
  id: string;
  url: string | null;
  label: string;
  index: number;
  status: PromptImageStatus;
  metadata?: PromptImageMetadata;
}

export interface PromptImageData {
  id: string;
  label: string;
  url: string;
  index: number;
  metadata?: PromptImageMetadata;
}

export interface PromptData {
  prompt: string;
  images: PromptImageData[];
}
