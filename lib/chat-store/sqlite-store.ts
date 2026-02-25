import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import { Message, MessagePart, getMessageText } from "@/features/ai-sdk/hooks/use-chat/types";
import { prisma } from "@/lib/prisma";
import {
  ChatEntity,
  ChatStore,
  CreateMessageInput,
  ListChatsParams,
  ListChatsResult,
  UpdateChatInput,
  UpdateMessageInput,
} from "./types";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const FALLBACK_CHAT_TITLE = "新聊天";
const CHAT_TITLE_MAX_LENGTH = 28;

const toIsoString = (value: Date) => value.toISOString();

const parseCreatedAt = (value: string | undefined) => {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const toMessageParts = (value: unknown): MessagePart[] => {
  if (!Array.isArray(value)) return [];
  return value as MessagePart[];
};

const toMessageText = (partsJson: unknown) =>
  getMessageText({
    id: "",
    role: "assistant",
    createdAt: "",
    parts: toMessageParts(partsJson),
  }).trim();

const getChatTitle = (title: string | null, firstUserMessageText?: string) => {
  const normalizedTitle = title?.trim();
  if (normalizedTitle) return normalizedTitle;
  if (!firstUserMessageText) return FALLBACK_CHAT_TITLE;
  if (firstUserMessageText.length <= CHAT_TITLE_MAX_LENGTH) return firstUserMessageText;
  return `${firstUserMessageText.slice(0, CHAT_TITLE_MAX_LENGTH).trimEnd()}...`;
};

const toInputJson = (parts: MessagePart[]): Prisma.InputJsonValue =>
  parts as unknown as Prisma.InputJsonValue;

const toMessage = (record: {
  id: string;
  chatId: string;
  role: string;
  partsJson: unknown;
  model: string | null;
  createdAt: Date;
}) => ({
  id: record.id,
  chatId: record.chatId,
  role: record.role as Message["role"],
  parts: toMessageParts(record.partsJson),
  model: record.model ?? undefined,
  createdAt: toIsoString(record.createdAt),
});

const toChatEntity = (record: {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): ChatEntity => ({
  id: record.id,
  title: record.title,
  createdAt: toIsoString(record.createdAt),
  updatedAt: toIsoString(record.updatedAt),
  deletedAt: record.deletedAt ? toIsoString(record.deletedAt) : null,
});

export class SqliteChatStore implements ChatStore {
  async createChat(input?: { id?: string; title?: string }) {
    const created = await prisma.chat.create({
      data: {
        id: input?.id ?? nanoid(),
        title: input?.title ?? null,
      },
    });

    return toChatEntity(created);
  }

  async getChat(chatId: string) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, deletedAt: null },
    });

    return chat ? toChatEntity(chat) : null;
  }

  async listChats(params?: ListChatsParams): Promise<ListChatsResult> {
    const limit = Math.min(
      Math.max(params?.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT
    );

    let where: Prisma.ChatWhereInput = { deletedAt: null };
    if (params?.cursor) {
      const cursorChat = await prisma.chat.findFirst({
        where: { id: params.cursor, deletedAt: null },
        select: { id: true, updatedAt: true },
      });

      if (cursorChat) {
        where = {
          deletedAt: null,
          OR: [
            { updatedAt: { lt: cursorChat.updatedAt } },
            {
              updatedAt: cursorChat.updatedAt,
              id: { lt: cursorChat.id },
            },
          ],
        };
      }
    }

    const chats = await prisma.chat.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { seq: "desc" },
          take: 1,
          select: { partsJson: true },
        },
      },
    });

    const hasMore = chats.length > limit;
    const pageItems = hasMore ? chats.slice(0, limit) : chats;
    const pageChatIds = pageItems.map((item) => item.id);

    const firstUserMessages = pageChatIds.length
      ? await prisma.message.findMany({
          where: {
            chatId: { in: pageChatIds },
            role: "user",
          },
          orderBy: [{ chatId: "asc" }, { seq: "asc" }],
          select: {
            chatId: true,
            partsJson: true,
          },
        })
      : [];

    const firstUserMessageTextByChat = new Map<string, string>();
    for (const message of firstUserMessages) {
      if (firstUserMessageTextByChat.has(message.chatId)) continue;
      const messageText = toMessageText(message.partsJson);
      if (!messageText) continue;
      firstUserMessageTextByChat.set(message.chatId, messageText);
    }

    return {
      items: pageItems.map((chat) => ({
        ...toChatEntity(chat),
        title: getChatTitle(chat.title, firstUserMessageTextByChat.get(chat.id)),
        messageCount: chat._count.messages,
        lastMessagePreview: chat.messages[0]
          ? toMessageText(chat.messages[0].partsJson).slice(0, 120) || null
          : null,
      })),
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  async updateChat(chatId: string, input: UpdateChatInput) {
    const existing = await prisma.chat.findFirst({
      where: { id: chatId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) return null;

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
      },
    });

    return toChatEntity(updated);
  }

  async deleteChat(chatId: string) {
    const result = await prisma.chat.updateMany({
      where: { id: chatId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }

  async listMessages(chatId: string) {
    const messages = await prisma.message.findMany({
      where: {
        chatId,
        chat: {
          deletedAt: null,
        },
      },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        chatId: true,
        role: true,
        partsJson: true,
        model: true,
        createdAt: true,
      },
    });

    return messages.map((item) => toMessage(item));
  }

  async syncMessages(chatId: string, messages: Message[]) {
    await prisma.$transaction(async (tx) => {
      await tx.chat.upsert({
        where: { id: chatId },
        update: { deletedAt: null },
        create: { id: chatId },
      });

      await tx.message.deleteMany({ where: { chatId } });

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        await tx.message.create({
          data: {
            id: message.id,
            chatId,
            role: message.role,
            partsJson: toInputJson(message.parts),
            model: message.model ?? null,
            status: "done",
            seq: i + 1,
            createdAt: parseCreatedAt(message.createdAt),
          },
        });
      }
    });
  }

  async createMessage(input: CreateMessageInput) {
    const created = await prisma.$transaction(async (tx) => {
      await tx.chat.upsert({
        where: { id: input.chatId },
        update: { deletedAt: null },
        create: { id: input.chatId },
      });

      const latest = await tx.message.findFirst({
        where: { chatId: input.chatId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });

      const seq = (latest?.seq ?? 0) + 1;

      return tx.message.create({
        data: {
          id: input.id,
          chatId: input.chatId,
          role: input.role,
          partsJson: toInputJson(input.parts),
          model: input.model ?? null,
          status: input.status ?? "done",
          seq,
          createdAt: parseCreatedAt(input.createdAt),
        },
        select: {
          id: true,
          chatId: true,
          role: true,
          partsJson: true,
          model: true,
          createdAt: true,
        },
      });
    });

    return toMessage(created);
  }

  async updateMessage(chatId: string, messageId: string, input: UpdateMessageInput) {
    const existing = await prisma.message.findFirst({
      where: {
        id: messageId,
        chatId,
        chat: { deletedAt: null },
      },
      select: { id: true },
    });

    if (!existing) return null;

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        ...(input.parts ? { partsJson: toInputJson(input.parts) } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      select: {
        id: true,
        chatId: true,
        role: true,
        partsJson: true,
        model: true,
        createdAt: true,
      },
    });

    return toMessage(updated);
  }

  async deleteMessage(chatId: string, messageId: string) {
    const result = await prisma.message.deleteMany({
      where: { id: messageId, chatId },
    });
    return result.count > 0;
  }
}
