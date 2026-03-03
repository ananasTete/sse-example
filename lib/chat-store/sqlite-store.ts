import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import {
  ChatMessageV2,
  ConversationNode,
  ConversationStateV2,
  MessagePartV2,
  MessageRole,
  getMessageText,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { prisma } from "@/lib/prisma";
import {
  ChatEntity,
  ChatStore,
  CreateMessageInput,
  HideMessageSubtreeResult,
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

const toMessageParts = (value: unknown): MessagePartV2[] => {
  if (!Array.isArray(value)) return [];
  return value as MessagePartV2[];
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

const toInputJson = (parts: MessagePartV2[]): Prisma.InputJsonValue =>
  parts as unknown as Prisma.InputJsonValue;

const normalizeRole = (role: string): MessageRole => {
  if (role === "user" || role === "assistant" || role === "system") return role;
  return "assistant";
};

const toMessage = (record: {
  id: string;
  chatId: string;
  role: string;
  partsJson: unknown;
  model: string | null;
  createdAt: Date;
}): ChatMessageV2 => ({
  id: record.id,
  chatId: record.chatId,
  role: normalizeRole(record.role),
  parts: toMessageParts(record.partsJson),
  model: record.model ?? undefined,
  createdAt: toIsoString(record.createdAt),
});

const toChatEntity = (record: {
  id: string;
  userId: string;
  title: string | null;
  cursorMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): ChatEntity => ({
  id: record.id,
  userId: record.userId,
  title: record.title,
  cursorMessageId: record.cursorMessageId,
  createdAt: toIsoString(record.createdAt),
  updatedAt: toIsoString(record.updatedAt),
  deletedAt: record.deletedAt ? toIsoString(record.deletedAt) : null,
});

const getConversationRootId = (chatId: string) => `chat-root:${chatId}`;

const getNodeSortScore = (node: ConversationNode): { time: number; id: string } => {
  const value = node.message?.createdAt ? Date.parse(node.message.createdAt) : 0;
  return {
    time: Number.isFinite(value) ? value : 0,
    id: node.id,
  };
};

const compareNodeDesc = (a: ConversationNode, b: ConversationNode) => {
  const aScore = getNodeSortScore(a);
  const bScore = getNodeSortScore(b);
  if (aScore.time !== bScore.time) return bScore.time - aScore.time;
  return bScore.id.localeCompare(aScore.id);
};

const resolveDefaultCursorId = (
  mapping: Record<string, ConversationNode>,
  rootId: string,
): string => {
  const nodes = Object.values(mapping).filter((node) => node.id !== rootId);
  if (nodes.length === 0) return rootId;

  const visibleLeafNodes = nodes.filter((node) => {
    if (!node.visible) return false;
    const hasVisibleChild = node.childIds.some((childId) => {
      const child = mapping[childId];
      return Boolean(child?.visible);
    });
    return !hasVisibleChild;
  });

  if (visibleLeafNodes.length > 0) {
    return [...visibleLeafNodes].sort(compareNodeDesc)[0].id;
  }

  const visibleNodes = nodes.filter((node) => node.visible);
  if (visibleNodes.length > 0) {
    return [...visibleNodes].sort(compareNodeDesc)[0].id;
  }

  return [...nodes].sort(compareNodeDesc)[0].id;
};

export class SqliteChatStore implements ChatStore {
  async createChat(input?: {
    id?: string;
    title?: string;
    userId?: string;
    cursorMessageId?: string | null;
  }) {
    const created = await prisma.chat.create({
      data: {
        id: input?.id ?? nanoid(),
        userId: input?.userId ?? "local-user",
        title: input?.title ?? null,
        cursorMessageId: input?.cursorMessageId ?? null,
      },
    });

    return toChatEntity(created);
  }

  async getChat(chatId: string, userId?: string) {
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        deletedAt: null,
        ...(userId ? { userId } : {}),
      },
    });

    return chat ? toChatEntity(chat) : null;
  }

  async listChats(params?: ListChatsParams): Promise<ListChatsResult> {
    const limit = Math.min(
      Math.max(params?.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );

    let where: Prisma.ChatWhereInput = {
      deletedAt: null,
      ...(params?.userId ? { userId: params.userId } : {}),
    };

    if (params?.cursor) {
      const cursorChat = await prisma.chat.findFirst({
        where: {
          id: params.cursor,
          deletedAt: null,
          ...(params?.userId ? { userId: params.userId } : {}),
        },
        select: { id: true, updatedAt: true },
      });

      if (cursorChat) {
        where = {
          deletedAt: null,
          ...(params?.userId ? { userId: params.userId } : {}),
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
      select: {
        id: true,
        userId: true,
        title: true,
        cursorMessageId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    const hasMore = chats.length > limit;
    const pageItems = hasMore ? chats.slice(0, limit) : chats;
    const pageChatIds = pageItems.map((item) => item.id);

    const visibleCounts = pageChatIds.length
      ? await prisma.message.groupBy({
          by: ["chatId"],
          where: {
            chatId: { in: pageChatIds },
            visible: true,
          },
          _count: {
            _all: true,
          },
        })
      : [];

    const visibleCountByChat = new Map<string, number>();
    for (const row of visibleCounts) {
      visibleCountByChat.set(row.chatId, row._count._all);
    }

    const firstVisibleUsers = pageChatIds.length
      ? await prisma.message.findMany({
          where: {
            chatId: { in: pageChatIds },
            role: "user",
            visible: true,
          },
          orderBy: [{ chatId: "asc" }, { seq: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            chatId: true,
            partsJson: true,
          },
        })
      : [];

    const firstUserMessageTextByChat = new Map<string, string>();
    for (const message of firstVisibleUsers) {
      if (firstUserMessageTextByChat.has(message.chatId)) continue;
      const messageText = toMessageText(message.partsJson);
      if (!messageText) continue;
      firstUserMessageTextByChat.set(message.chatId, messageText);
    }

    const previewByChat = new Map<string, string | null>();

    const cursorIds = pageItems
      .map((item) => item.cursorMessageId)
      .filter((value): value is string => Boolean(value));

    const cursorMessages = cursorIds.length
      ? await prisma.message.findMany({
          where: {
            id: { in: cursorIds },
            visible: true,
          },
          select: {
            id: true,
            chatId: true,
            partsJson: true,
          },
        })
      : [];

    for (const message of cursorMessages) {
      previewByChat.set(message.chatId, toMessageText(message.partsJson).slice(0, 120) || null);
    }

    const missingPreviewChatIds = pageChatIds.filter((chatId) => !previewByChat.has(chatId));
    const latestVisibleMessages = missingPreviewChatIds.length
      ? await prisma.message.findMany({
          where: {
            chatId: { in: missingPreviewChatIds },
            visible: true,
          },
          orderBy: [
            { chatId: "asc" },
            { seq: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          select: {
            chatId: true,
            partsJson: true,
          },
        })
      : [];

    for (const message of latestVisibleMessages) {
      if (previewByChat.has(message.chatId)) continue;
      previewByChat.set(message.chatId, toMessageText(message.partsJson).slice(0, 120) || null);
    }

    return {
      items: pageItems.map((chat) => ({
        ...toChatEntity(chat),
        title: getChatTitle(chat.title, firstUserMessageTextByChat.get(chat.id)),
        messageCount: visibleCountByChat.get(chat.id) ?? 0,
        lastMessagePreview: previewByChat.get(chat.id) ?? null,
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

    if (input.cursorMessageId !== undefined && input.cursorMessageId !== null) {
      const cursorMessage = await prisma.message.findFirst({
        where: {
          id: input.cursorMessageId,
          chatId,
          visible: true,
        },
        select: { id: true },
      });

      if (!cursorMessage) {
        throw new Error("cursor message not found");
      }
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.cursorMessageId !== undefined
          ? { cursorMessageId: input.cursorMessageId }
          : {}),
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

  async getConversation(chatId: string, userId?: string): Promise<ConversationStateV2 | null> {
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        deletedAt: null,
        ...(userId ? { userId } : {}),
      },
      select: {
        id: true,
        cursorMessageId: true,
      },
    });

    if (!chat) return null;

    const records = await prisma.message.findMany({
      where: {
        chatId,
        chat: {
          deletedAt: null,
          ...(userId ? { userId } : {}),
        },
      },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        chatId: true,
        parentId: true,
        role: true,
        partsJson: true,
        model: true,
        visible: true,
        createdAt: true,
      },
    });

    const rootId = getConversationRootId(chatId);
    const mapping: Record<string, ConversationNode> = {
      [rootId]: {
        id: rootId,
        parentId: null,
        childIds: [],
        role: "root",
        message: null,
        visible: false,
      },
    };

    for (const record of records) {
      const role = normalizeRole(record.role);
      const nodeParentId = record.parentId ?? rootId;
      const message = toMessage(record);

      mapping[record.id] = {
        id: record.id,
        parentId: nodeParentId,
        childIds: [],
        role,
        message,
        visible: record.visible,
      };
    }

    for (const node of Object.values(mapping)) {
      if (node.id === rootId) continue;

      const parentId = node.parentId && mapping[node.parentId] ? node.parentId : rootId;
      node.parentId = parentId;
      const parent = mapping[parentId];
      if (!parent.childIds.includes(node.id)) {
        parent.childIds.push(node.id);
      }
    }

    let cursorId = chat.cursorMessageId && mapping[chat.cursorMessageId]
      ? chat.cursorMessageId
      : resolveDefaultCursorId(mapping, rootId);

    if (!cursorId) {
      cursorId = rootId;
    }

    return {
      rootId,
      cursorId,
      mapping,
    };
  }

  async listMessages(chatId: string, userId?: string) {
    const messages = await prisma.message.findMany({
      where: {
        chatId,
        visible: true,
        chat: {
          deletedAt: null,
          ...(userId ? { userId } : {}),
        },
      },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }, { id: "asc" }],
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

  async appendUserNodeIfMissing(
    chatId: string,
    parentId: string | null,
    message: ChatMessageV2,
  ) {
    if (message.role !== "user") return;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.message.findFirst({
        where: { id: message.id, chatId },
        select: { id: true },
      });

      if (existing) return;

      if (parentId) {
        const parent = await tx.message.findFirst({
          where: {
            id: parentId,
            chatId,
          },
          select: { id: true },
        });

        if (!parent) {
          throw new Error("parent message not found");
        }
      }

      const latest = await tx.message.findFirst({
        where: { chatId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });

      await tx.message.create({
        data: {
          id: message.id,
          chatId,
          parentId,
          role: message.role,
          partsJson: toInputJson(message.parts),
          model: message.model ?? null,
          status: "done",
          visible: true,
          seq: (latest?.seq ?? 0) + 1,
          createdAt: parseCreatedAt(message.createdAt),
        },
      });
    });
  }

  async createMessage(input: CreateMessageInput) {
    const created = await prisma.$transaction(async (tx) => {
      await tx.chat.upsert({
        where: { id: input.chatId },
        update: { deletedAt: null },
        create: {
          id: input.chatId,
          userId: "local-user",
          cursorMessageId: null,
        },
      });

      if (input.parentId) {
        const parent = await tx.message.findFirst({
          where: {
            id: input.parentId,
            chatId: input.chatId,
          },
          select: { id: true },
        });

        if (!parent) {
          throw new Error("parent message not found");
        }
      }

      const latest = await tx.message.findFirst({
        where: { chatId: input.chatId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });

      return tx.message.create({
        data: {
          id: input.id,
          chatId: input.chatId,
          parentId: input.parentId ?? null,
          role: input.role,
          partsJson: toInputJson(input.parts),
          model: input.model ?? null,
          status: input.status ?? "done",
          visible: input.visible ?? true,
          seq: (latest?.seq ?? 0) + 1,
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
        ...(input.visible !== undefined ? { visible: input.visible } : {}),
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

  async hideMessageSubtree(
    chatId: string,
    messageId: string,
  ): Promise<HideMessageSubtreeResult | null> {
    return prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { id: true, cursorMessageId: true },
      });

      if (!chat) return null;

      const records = await tx.message.findMany({
        where: { chatId },
        select: {
          id: true,
          parentId: true,
          visible: true,
        },
      });

      const target = records.find((record) => record.id === messageId);
      if (!target) return null;

      const childrenByParent = new Map<string | null, string[]>();
      const byId = new Map(records.map((record) => [record.id, record]));
      for (const record of records) {
        const key = record.parentId ?? null;
        const list = childrenByParent.get(key) ?? [];
        list.push(record.id);
        childrenByParent.set(key, list);
      }

      const stack = [messageId];
      const hiddenSet = new Set<string>();

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || hiddenSet.has(current)) continue;
        hiddenSet.add(current);

        const children = childrenByParent.get(current) ?? [];
        for (const childId of children) {
          if (!hiddenSet.has(childId)) {
            stack.push(childId);
          }
        }
      }

      const hiddenMessageIds = [...hiddenSet];
      if (hiddenMessageIds.length > 0) {
        await tx.message.updateMany({
          where: {
            chatId,
            id: { in: hiddenMessageIds },
          },
          data: { visible: false },
        });
      }

      let nextCursor = chat.cursorMessageId ?? null;
      if (nextCursor && hiddenSet.has(nextCursor)) {
        let current: string | null = nextCursor;

        while (current) {
          const node = byId.get(current);
          if (!node) {
            current = null;
            break;
          }

          if (!hiddenSet.has(current) && node.visible) {
            break;
          }

          current = node.parentId ?? null;
        }

        nextCursor = current;
      }

      if (nextCursor !== chat.cursorMessageId) {
        await tx.chat.update({
          where: { id: chatId },
          data: { cursorMessageId: nextCursor },
        });
      }

      return {
        hiddenMessageIds,
        cursorMessageId: nextCursor,
      };
    });
  }
}
