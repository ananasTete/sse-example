import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "./keys";
import { createChatSession } from "./useCreateChatSessionMutation";
import type { DraftSession } from "../types";

const DRAFT_SESSION_SCOPE = "session-chat-index";
const DRAFT_SESSION_GC_TIME_MS = 259200 * 1000;
const DRAFT_SESSION_QUERY_KEY = chatKeys.draftSession(DRAFT_SESSION_SCOPE);

function isDraftSessionExpired(draftSession: DraftSession) {
  const expiresAt =
    draftSession.chat_session.inserted_at + draftSession.ttl_seconds;
  return Date.now() / 1000 >= expiresAt;
}

/**
 * 在新页面调用。立即预创建会话，用于后续发消息。
 * 提供 consume 确保缓存存在以及会话没过期用于场景在当前页面但不发起会话的场景
 */
export function useDraftSession() {
  const queryClient = useQueryClient();
  const createDraftSession = useCallback(() => createChatSession(), []);

  const query = useQuery({
    queryKey: DRAFT_SESSION_QUERY_KEY,
    queryFn: createDraftSession,
    staleTime: Infinity,
    gcTime: DRAFT_SESSION_GC_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const consume = useCallback(async () => {
    // 获取缓存，失败则重新请求
    let draftSession = await queryClient.ensureQueryData({
      queryKey: DRAFT_SESSION_QUERY_KEY,
      queryFn: createDraftSession,
      staleTime: Infinity,
      gcTime: DRAFT_SESSION_GC_TIME_MS,
    });

    // 过期则重新获取
    if (isDraftSessionExpired(draftSession)) {
      queryClient.removeQueries({
        queryKey: DRAFT_SESSION_QUERY_KEY,
        exact: true,
      });
      draftSession = await queryClient.fetchQuery({
        queryKey: DRAFT_SESSION_QUERY_KEY,
        queryFn: createDraftSession,
        staleTime: Infinity,
        gcTime: DRAFT_SESSION_GC_TIME_MS,
      });
    }

    queryClient.removeQueries({
      queryKey: DRAFT_SESSION_QUERY_KEY,
      exact: true,
    });

    return draftSession;
  }, [createDraftSession, queryClient]);

  return {
    ...query,
    consume,
  };
}
