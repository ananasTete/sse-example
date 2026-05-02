import {
  InfiniteData,
  QueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { chatKeys } from "./keys";
import { useMemo } from "react";
import {
  ChatSessionListItem,
  ChatSessionsPage,
  ChatSessionsPageCursor,
  ChatSessionsPageResponse,
  ChatTitleType,
  DraftSession,
} from "../types";

export async function fetchChatSessionsPage({
  cursor,
}: {
  cursor?: ChatSessionsPageCursor;
} = {}): Promise<ChatSessionsPage> {
  const params = new URLSearchParams();
  params.set("lte_cursor.pinned", "false");

  if (cursor !== undefined) {
    params.set("lte_cursor.updated_at", String(cursor.updated_at));
    params.set("lte_cursor.seq_id", String(cursor.seq_id));
  }

  const response = await fetch(
    `/api/v0/chat_session/fetch_page?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("加载会话列表失败");
  }

  const body = (await response.json()) as ChatSessionsPageResponse;
  const bizData = body.data?.biz_data;
  const items = bizData?.chat_sessions ?? [];
  const lastItem = items.at(-1);
  const hasMore = bizData?.has_more ?? false;
  const nextCursor =
    bizData?.next_cursor ??
    (hasMore && lastItem
      ? { updated_at: lastItem.updated_at, seq_id: lastItem.seq_id }
      : null);

  return {
    items,
    nextCursor,
    hasMore,
  };
}

export function useChatSessionList() {
  const query = useInfiniteQuery({
    queryKey: chatKeys.sessions(),
    initialPageParam: undefined as ChatSessionsPageCursor | undefined,
    queryFn: ({
      pageParam,
    }: {
      pageParam: ChatSessionsPageCursor | undefined;
    }) =>
      fetchChatSessionsPage({
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(() => {
    const uniqueItems = new Map<string, ChatSessionListItem>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        uniqueItems.set(item.id, item);
      }
    }

    return Array.from(uniqueItems.values()).sort(
      (left, right) =>
        right.updated_at - left.updated_at || right.seq_id - left.seq_id,
    );
  }, [query.data]);

  return {
    ...query,
    items,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
  };
}

type ChatSessionsInfiniteData = InfiniteData<
  ChatSessionsPage,
  ChatSessionsPageCursor | undefined
>;

function createEmptySessionsData(): ChatSessionsInfiniteData {
  return {
    pages: [
      {
        items: [],
        nextCursor: null,
        hasMore: false,
      },
    ],
    pageParams: [undefined],
  };
}

export function upsertChatSessionListItem(
  queryClient: QueryClient,
  item: ChatSessionListItem,
) {
  queryClient.setQueryData<ChatSessionsInfiniteData>(
    chatKeys.sessions(),
    (currentData) => {
      const current = currentData ?? createEmptySessionsData();
      const pages = current.pages.length
        ? current.pages.map((page) => ({
            ...page,
            items: page.items.filter((session) => session.id !== item.id),
          }))
        : createEmptySessionsData().pages;

      pages[0] = {
        ...pages[0],
        items: [item, ...pages[0].items],
      };

      return {
        ...current,
        pages,
      };
    },
  );
}

export function upsertChatSessionList(
  queryClient: QueryClient,
  draftSession: DraftSession,
) {
  const { id, seq_id, title, title_type, pinned, model_type, updated_at } =
    draftSession.chat_session;
  upsertChatSessionListItem(queryClient, {
    id,
    seq_id,
    title: title ?? null,
    title_type: title_type ?? "WIP",
    pinned: pinned ?? false,
    model_type: model_type ?? "default",
    updated_at: updated_at ?? Date.now() / 1000,
  });
}

export function updateChatSessionListItem(
  queryClient: QueryClient,
  chatSessionId: string,
  patch: Partial<Omit<ChatSessionListItem, "id">>,
) {
  queryClient.setQueryData<ChatSessionsInfiniteData>(
    chatKeys.sessions(),
    (currentData) => {
      if (!currentData) return currentData;

      return {
        ...currentData,
        pages: currentData.pages.map((page) => ({
          ...page,
          items: page.items.map((session) =>
            session.id === chatSessionId ? { ...session, ...patch } : session,
          ),
        })),
      };
    },
  );
}

export function updateChatSessionTitleInCaches(
  queryClient: QueryClient,
  chatSessionId: string,
  title: string,
  titleType: ChatTitleType = "SYSTEM",
) {
  updateChatSessionListItem(queryClient, chatSessionId, {
    title,
    title_type: titleType,
  });
}
