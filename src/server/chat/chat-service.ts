import type {
  ConversationNode,
  ConversationStateV2,
} from "@/features/ai-sdk/hooks/use-chat-v2/types";
import type { ChatEntity, ChatRunEntity, ListChatsResult } from "@/lib/chat-store";

export const DEFAULT_USER_ID = "local-user";

interface FlatChatResponse {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  settings: {
    enabled_web_search: boolean;
  };
}

interface ApiConversationStateV2 {
  rootId: string;
  current_leaf_message_id: string;
  mapping: Record<string, ConversationNode>;
}

export interface FlatChatDetailResponse extends FlatChatResponse {
  conversation: ApiConversationStateV2;
  active_run?: {
    id: string;
    assistant_message_id: string;
    status: string;
    resume_token: string;
    last_seq: number;
    created_at: string;
  };
}

export interface FlatChatHistoryResponse {
  items: Array<{
    id: string;
    title: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    lastMessagePreview: string | null;
    messageCount: number;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export function resolveRequestUserId(request: Request): string {
  const userId = request.headers.get("x-user-id")?.trim();
  return userId || DEFAULT_USER_ID;
}

export function toFlatChatResponse(chat: ChatEntity): FlatChatResponse {
  return {
    id: chat.id,
    title: chat.title ?? "",
    userId: chat.userId,
    createdAt: chat.createdAt,
    settings: {
      enabled_web_search: chat.settings.enabledWebSearch,
    },
  };
}

export function toFlatChatDetailResponse(
  chat: ChatEntity,
  conversation: ConversationStateV2,
  activeRun?: ChatRunEntity | null,
): FlatChatDetailResponse {
  return {
    ...toFlatChatResponse(chat),
    conversation: {
      rootId: conversation.rootId,
      current_leaf_message_id: conversation.cursorId,
      mapping: conversation.mapping,
    },
    ...(activeRun
      ? {
          active_run: {
            id: activeRun.id,
            assistant_message_id: activeRun.assistantMessageId,
            status: activeRun.status,
            resume_token: activeRun.resumeToken,
            last_seq: activeRun.lastEventSeq,
            created_at: activeRun.createdAt,
          },
        }
      : {}),
  };
}

export function toFlatHistoryResponse(
  result: ListChatsResult,
): FlatChatHistoryResponse {
  return {
    items: result.items.map((item) => ({
      id: item.id,
      title: item.title,
      userId: item.userId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastMessagePreview: item.lastMessagePreview,
      messageCount: item.messageCount,
    })),
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  };
}
