import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  CHAT_HISTORY_PAGE_SIZE,
  ChatHistoryItem,
  ChatHistoryResponse,
  chatHistoryKeys,
  fetchChatHistoryPage,
} from "../services/chat-history";

interface UseChatHistoryQueryOptions {
  pageSize?: number;
}

export function useChatHistoryQuery({
  pageSize = CHAT_HISTORY_PAGE_SIZE,
}: UseChatHistoryQueryOptions = {}) {
  const query = useInfiniteQuery({
    queryKey: chatHistoryKeys.list(pageSize),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchChatHistoryPage({
        cursor: pageParam,
        limit: pageSize,
      }),
    getNextPageParam: (lastPage: ChatHistoryResponse) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
  });

  const items = useMemo(() => {
    const uniqueItems = new Map<string, ChatHistoryItem>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      }
    }
    return Array.from(uniqueItems.values());
  }, [query.data]);

  return {
    items,
    hasMore: Boolean(query.hasNextPage),
    isInitialLoading: query.isPending,
    isLoadingMore: query.isFetchingNextPage,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    loadMore: query.fetchNextPage,
    reload: query.refetch,
  };
}
