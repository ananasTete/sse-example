export type PromptResourceStatus = "uploading" | "ready" | "failed";

export type PromptResourceKind =
  | "local_image"
  | "subject_image"
  | "history_image";

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

export interface PromptRegion {
  topLeft: {
    x: number;
    y: number;
  };
  bottomRight: {
    x: number;
    y: number;
  };
}

export type PromptReference =
  | {
      type: "slot";
      slot: number;
    }
  | {
      type: "handle";
      handle: string;
    };

export interface PromptAsset {
  url: string;
}

export type PromptSourceMeta =
  | {
      type: "local";
    }
  | {
      type: "subject";
      subjectId: string;
    }
  | {
      type: "history";
      historyId: string;
      originTaskId?: string;
      outputIndex?: number;
    };

export interface PromptResourceTransform {
  crop?: CropMetadata;
  selectedRegion?: PromptRegion;
}

export interface PromptResource {
  id: string;
  kind: PromptResourceKind;
  status: PromptResourceStatus;
  reference: PromptReference;
  asset?: PromptAsset;
  transform?: PromptResourceTransform;
  sourceMeta?: PromptSourceMeta;
}

export type ReadyPromptResource = PromptResource & {
  status: "ready";
  asset: PromptAsset;
};

export interface PromptPayload {
  text: string;
  resources: PromptResource[];
}
