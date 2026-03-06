import type { JSONContent } from "@tiptap/core";

export type PromptImageStatus = "uploading" | "ready";

export interface PromptImage {
  id: string;
  url: string | null;
  label: string;
  index: number;
  status: PromptImageStatus;
}

export interface PromptImageData {
  id: string;
  label: string;
  url: string;
  index: number;
}

export interface PromptData {
  prompt: string;
  content: JSONContent;
  images: PromptImageData[];
}
