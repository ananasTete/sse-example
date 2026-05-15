import {
  InfiniteData,
  QueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { agentChatKeys } from "./keys";
import type {
  AgentChatSessionListItem,
  AgentChatSessionsPage,
  AgentChatSessionsPageCursor,
  AgentChatSessionsPageResponse,
  AgentChatTitleType,
  AgentDraftSession,
} from "../types";

export async function fetchAgentChatSessionsPage({
  cursor,
}: {
  cursor?: AgentChatSessionsPageCursor;
} = {}): Promise<AgentChatSessionsPage> {
  const params = new URLSearchParams();
  params.set("lte_cursor.pinned", "false");

  if (cursor !== undefined) {
    params.set("lte_cursor.updated_at", String(cursor.updated_at));
    params.set("lte_cursor.seq_id", String(cursor.seq_id));
  }

  const response = await fetch(
    `/api/agent-editor/chat_session/fetch_page?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("加载会话列表失败");
  }

  const body = (await response.json()) as AgentChatSessionsPageResponse;
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

export function useAgentChatSessionList() {
  const query = useInfiniteQuery({
    queryKey: agentChatKeys.sessions(),
    initialPageParam: undefined as AgentChatSessionsPageCursor | undefined,
    queryFn: ({
      pageParam,
    }: {
      pageParam: AgentChatSessionsPageCursor | undefined;
    }) =>
      fetchAgentChatSessionsPage({
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(() => {
    const uniqueItems = new Map<string, AgentChatSessionListItem>();
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

type AgentChatSessionsInfiniteData = InfiniteData<
  AgentChatSessionsPage,
  AgentChatSessionsPageCursor | undefined
>;

function createEmptySessionsData(): AgentChatSessionsInfiniteData {
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

export function upsertAgentChatSessionListItem(
  queryClient: QueryClient,
  item: AgentChatSessionListItem,
) {
  queryClient.setQueryData<AgentChatSessionsInfiniteData>(
    agentChatKeys.sessions(),
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

export function upsertAgentChatSessionList(
  queryClient: QueryClient,
  draftSession: AgentDraftSession,
) {
  const { id, seq_id, title, title_type, pinned, updated_at } =
    draftSession.chat_session;
  upsertAgentChatSessionListItem(queryClient, {
    id,
    seq_id,
    title: title ?? null,
    title_type: title_type ?? "WIP",
    pinned: pinned ?? false,
    updated_at: updated_at ?? Date.now() / 1000,
  });
}

export function updateAgentChatSessionListItem(
  queryClient: QueryClient,
  chatSessionId: string,
  patch: Partial<Omit<AgentChatSessionListItem, "id">>,
) {
  queryClient.setQueryData<AgentChatSessionsInfiniteData>(
    agentChatKeys.sessions(),
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

export function updateAgentChatSessionTitleInCaches(
  queryClient: QueryClient,
  chatSessionId: string,
  title: string,
  titleType: AgentChatTitleType = "SYSTEM",
) {
  updateAgentChatSessionListItem(queryClient, chatSessionId, {
    title,
    title_type: titleType,
  });
}
