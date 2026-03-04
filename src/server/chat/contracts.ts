import {
  ChatMessageV2,
  MessagePartV2,
  RequestTrigger,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";

interface JsonObject {
  [key: string]: unknown;
}

export interface ApiMessagePartV2 {
  type: string;
  [key: string]: unknown;
}

export interface ApiUserMessageV2 {
  id: string;
  chatId?: string;
  role: "user";
  parts: ApiMessagePartV2[];
  createdAt: string;
  model?: string;
}

export interface ApiChatSettings {
  enabled_web_search: boolean;
}

export interface CreateChatRequestBody {
  id: string;
  title?: string;
  settings?: ApiChatSettings;
}

export interface StreamChatRequestBody {
  model: string;
  trigger: RequestTrigger;
  parentId: string;
  message: ApiUserMessageV2;
  settings?: ApiChatSettings;
}

export interface PatchChatRequestBody {
  title?: string | null;
  current_leaf_message_id?: string | null;
}

export type PatchMessageStatus = "done" | "streaming" | "aborted" | "error";

export interface PatchMessageRequestBody {
  parts?: MessagePartV2[];
  model?: string | null;
  status?: PatchMessageStatus;
  visible?: boolean;
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

const toStringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const assertString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value;
};

const parseParts = (parts: unknown, field: string): ApiMessagePartV2[] => {
  if (!Array.isArray(parts)) {
    throw new Error(`${field} must be an array`);
  }

  return parts.map((part, index) => {
    if (!isRecord(part)) {
      throw new Error(`${field}[${index}] must be an object`);
    }
    if (typeof part.type !== "string" || !part.type) {
      throw new Error(`${field}[${index}].type is required`);
    }

    return part as ApiMessagePartV2;
  });
};

const parseUserMessage = (value: unknown, fieldPrefix: string): ApiUserMessageV2 => {
  if (!isRecord(value)) {
    throw new Error(`${fieldPrefix} must be an object`);
  }

  if (value.role !== "user") {
    throw new Error(`${fieldPrefix}.role must be user`);
  }

  return {
    id: assertString(value.id, `${fieldPrefix}.id`),
    chatId: toStringOrUndefined(value.chatId),
    role: "user",
    parts: parseParts(value.parts, `${fieldPrefix}.parts`),
    createdAt: assertString(value.createdAt, `${fieldPrefix}.createdAt`),
    model: toStringOrUndefined(value.model),
  };
};

const parseChatSettings = (
  value: unknown,
  field: string,
): ApiChatSettings | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }

  if (value.enabled_web_search !== undefined) {
    if (typeof value.enabled_web_search !== "boolean") {
      throw new Error(`${field}.enabled_web_search must be a boolean`);
    }
    return {
      enabled_web_search: value.enabled_web_search,
    };
  }

  return {
    enabled_web_search: false,
  };
};

export const parseCreateChatRequest = (
  body: unknown,
): CreateChatRequestBody => {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  return {
    id: assertString(body.id, "id"),
    title: toStringOrUndefined(body.title),
    settings: parseChatSettings(body.settings, "settings"),
  };
};

export const parseStreamChatRequest = (
  body: unknown,
): StreamChatRequestBody => {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const model = assertString(body.model, "model");
  const triggerValue = body.trigger;
  const trigger: RequestTrigger =
    triggerValue === "regenerate-message"
      ? "regenerate-message"
      : "submit-message";

  return {
    model,
    trigger,
    parentId: assertString(body.parentId, "parentId"),
    message: parseUserMessage(body.message, "message"),
    settings: parseChatSettings(body.settings, "settings"),
  };
};

export const parsePatchChatRequest = (body: unknown): PatchChatRequestBody => {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const result: PatchChatRequestBody = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" && body.title !== null) {
      throw new Error("title must be a string or null");
    }
    result.title = body.title;
  }

  if (body.current_leaf_message_id !== undefined) {
    if (
      typeof body.current_leaf_message_id !== "string" &&
      body.current_leaf_message_id !== null
    ) {
      throw new Error("current_leaf_message_id must be a string or null");
    }
    result.current_leaf_message_id = body.current_leaf_message_id;
  }

  return result;
};

const isPatchMessageStatus = (value: unknown): value is PatchMessageStatus =>
  value === "done" ||
  value === "streaming" ||
  value === "aborted" ||
  value === "error";

export const parsePatchMessageRequest = (
  body: unknown,
): PatchMessageRequestBody => {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const result: PatchMessageRequestBody = {};

  if (body.parts !== undefined) {
    result.parts = parseParts(body.parts, "parts") as MessagePartV2[];
  }

  if (body.model !== undefined) {
    if (typeof body.model !== "string" && body.model !== null) {
      throw new Error("model must be a string or null");
    }
    result.model = body.model;
  }

  if (body.status !== undefined) {
    if (!isPatchMessageStatus(body.status)) {
      throw new Error("status is invalid");
    }
    result.status = body.status;
  }

  if (body.visible !== undefined) {
    if (typeof body.visible !== "boolean") {
      throw new Error("visible must be a boolean");
    }
    result.visible = body.visible;
  }

  return result;
};

export const toChatMessageV2 = (
  chatId: string,
  message: ApiUserMessageV2,
): ChatMessageV2 => {
  return {
    id: message.id,
    chatId,
    role: "user",
    parts: message.parts as MessagePartV2[],
    createdAt: message.createdAt,
    model: message.model,
  };
};
