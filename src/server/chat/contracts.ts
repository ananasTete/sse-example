interface JsonObject {
  [key: string]: unknown;
}

export interface ApiMessagePart {
  type: string;
  [key: string]: unknown;
}

export interface ApiMessage {
  id: string;
  chatId?: string;
  role: "user" | "assistant";
  parts: ApiMessagePart[];
  createdAt: string;
  model?: string;
}

export interface CreateChatRequestBody {
  id: string;
  message: {
    id?: string;
    role: "user";
    parts: ApiMessagePart[];
    createdAt?: string;
  };
}

export interface StreamChatRequestBody {
  id?: string;
  model: string;
  messages: ApiMessage[];
  trigger: "submit-message" | "regenerate-message";
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

const parseParts = (parts: unknown): ApiMessagePart[] => {
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
    return part as ApiMessagePart;
  });
};

const parseMessage = (value: unknown, fieldPrefix: string): ApiMessage => {
  if (!isRecord(value)) {
    throw new Error(`${fieldPrefix} must be an object`);
  }

  const role = value.role;
  if (role !== "user" && role !== "assistant") {
    throw new Error(`${fieldPrefix}.role must be user or assistant`);
  }

  return {
    id: assertString(value.id, `${fieldPrefix}.id`),
    chatId: toStringOrUndefined(value.chatId),
    role,
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

  const messageValue = body.message;
  if (!isRecord(messageValue)) {
    throw new Error("message is required");
  }

  const role = messageValue.role;
  if (role !== "user") {
    throw new Error("message.role must be user");
  }

  return {
    id: assertString(body.id, "id"),
    message: {
      id: toStringOrUndefined(messageValue.id),
      role,
      parts: parseParts(messageValue.parts),
      createdAt: toStringOrUndefined(messageValue.createdAt),
    },
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
  const trigger =
    triggerValue === "regenerate-message"
      ? "regenerate-message"
      : "submit-message";

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error("messages is required");
  }

  return {
    id: toStringOrUndefined(body.id),
    model,
    trigger,
    messages: body.messages.map((message, index) =>
      parseMessage(message, `messages[${index}]`),
    ),
  };
};
