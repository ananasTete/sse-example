import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentChatKeys } from "./keys";
import { createAgentChatSession } from "./useCreateAgentChatSessionMutation";
import type { AgentDraftSession } from "../types";

const DRAFT_SESSION_GC_TIME_MS = 259200 * 1000;
const DRAFT_SESSION_QUERY_KEY = agentChatKeys.draftSession();

function isDraftSessionExpired(draftSession: AgentDraftSession) {
  const expiresAt =
    draftSession.chat_session.inserted_at + draftSession.ttl_seconds;
  return Date.now() / 1000 >= expiresAt;
}

export function useAgentDraftSession() {
  const queryClient = useQueryClient();
  const createDraftSession = useCallback(() => createAgentChatSession(), []);

  const query = useQuery({
    queryKey: DRAFT_SESSION_QUERY_KEY,
    queryFn: createDraftSession,
    enabled: false,
    staleTime: Infinity,
    gcTime: DRAFT_SESSION_GC_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const consume = useCallback(async () => {
    let draftSession = await queryClient.ensureQueryData({
      queryKey: DRAFT_SESSION_QUERY_KEY,
      queryFn: createDraftSession,
      staleTime: Infinity,
      gcTime: DRAFT_SESSION_GC_TIME_MS,
    });

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
