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

export interface CreateChatRequestBody {
  id: string;
  title?: string;
}

export interface StreamChatRequestBody {
  model: string;
  trigger: RequestTrigger;
  parentId: string;
  message: ApiUserMessageV2;
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

const parseParts = (parts: unknown): ApiMessagePartV2[] => {
  if (!Array.isArray(parts)) {
    throw new Error("message.parts must be an array");
  }

  return parts.map((part, index) => {
    if (!isRecord(part)) {
      throw new Error(`message.parts[${index}] must be an object`);
    }
    if (typeof part.type !== "string" || !part.type) {
      throw new Error(`message.parts[${index}].type is required`);
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
    parts: parseParts(value.parts),
    createdAt: assertString(value.createdAt, `${fieldPrefix}.createdAt`),
    model: toStringOrUndefined(value.model),
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
  };
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
