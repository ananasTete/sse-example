import { useMutation, useQueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { createUserMessage } from "../stream/messages";
import { processAgentChatCompletionStream } from "../stream/stream";
import type {
  AgentChatSessionListItem,
  AgentChatSessionPatch,
  AgentChatState,
} from "../types";
import { agentChatKeys } from "./keys";
import { updateAgentChatSessionListItem } from "./useAgentChatSessionList";

export async function createAgentChatCompletionRequest(input: {
  chatSessionId: string;
  prompt: string;
  parentMessageId: number | null;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
}) {
  return fetch("/api/agent-editor/chat/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      parent_message_id: input.parentMessageId,
      prompt: input.prompt,
      ref_file_ids: [],
      thinking_enabled: input.thinkingEnabled,
      search_enabled: input.searchEnabled,
      preempt: false,
    }),
  });
}

export async function createAgentResumeChatCompletionRequest(input: {
  chatSessionId: string;
  messageId: number;
}) {
  return fetch("/api/agent-editor/chat/resume_stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      message_id: input.messageId,
    }),
  });
}

let optimisticMessageId = 0;

function nextOptimisticMessageId() {
  optimisticMessageId -= 1;
  return optimisticMessageId;
}

function removeOptimisticUserMessage(
  state: AgentChatState | undefined,
  messageId: number,
) {
  if (!state) return state;

  return produce(state, (draft) => {
    const messageIndex = draft.chat_messages.findIndex(
      (message) => message.message_id === messageId && message.role === "USER",
    );

    if (messageIndex >= 0) {
      draft.chat_messages.splice(messageIndex, 1);
      draft.chat_session.is_empty = draft.chat_messages.length === 0;
    }
  });
}

function toSessionListPatch(
  patch: AgentChatSessionPatch,
): Partial<Omit<AgentChatSessionListItem, "id">> {
  const listPatch: Partial<Omit<AgentChatSessionListItem, "id">> = {};

  if ("title" in patch) listPatch.title = patch.title ?? null;
  if (patch.title_type !== undefined) listPatch.title_type = patch.title_type;
  if (patch.pinned !== undefined) listPatch.pinned = patch.pinned;
  if (patch.updated_at !== undefined) listPatch.updated_at = patch.updated_at;
  if (patch.seq_id !== undefined) listPatch.seq_id = patch.seq_id;

  return listPatch;
}

export function useAgentChatCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      chatSessionId: string;
      prompt: string;
      parentMessageId: number | null;
      thinkingEnabled?: boolean;
      searchEnabled?: boolean;
    }) => {
      const options = {
        chatSessionId: input.chatSessionId,
        prompt: input.prompt,
        parentMessageId: input.parentMessageId,
        thinkingEnabled: input.thinkingEnabled ?? false,
        searchEnabled: input.searchEnabled ?? false,
        optimisticUserMessageId: nextOptimisticMessageId(),
      };

      queryClient.setQueryData<AgentChatState | undefined>(
        agentChatKeys.session(input.chatSessionId),
        (state) => {
          if (!state) return state;

          return produce(state, (draft) => {
            draft.chat_messages.push(
              createUserMessage(options.optimisticUserMessageId, options),
            );
            draft.chat_session.is_empty = false;
          });
        },
      );

      let isReady = false;

      try {
        const response = await createAgentChatCompletionRequest(options);
        if (!response.ok) {
          throw new Error("生成失败");
        }

        await processAgentChatCompletionStream({
          response,
          updateState: (updater) => {
            queryClient.setQueryData(
              agentChatKeys.session(input.chatSessionId),
              updater,
            );
          },
          onReady: (payload) => {
            isReady = true;

            queryClient.setQueryData<AgentChatState | undefined>(
              agentChatKeys.session(input.chatSessionId),
              (state) => {
                if (!state) return state;

                return produce(state, (draft) => {
                  const optimistic = draft.chat_messages.find(
                    (message) =>
                      message.message_id === options.optimisticUserMessageId &&
                      message.role === "USER",
                  );
                  if (optimistic) {
                    optimistic.message_id = payload.user_message_id;
                    draft.chat_messages.sort(
                      (a, b) => a.message_id - b.message_id,
                    );
                  }
                });
              },
            );
          },
          onSessionPatch: (patch) => {
            const listPatch = toSessionListPatch(patch);
            if (Object.keys(listPatch).length === 0) return;

            updateAgentChatSessionListItem(
              queryClient,
              input.chatSessionId,
              listPatch,
            );
          },
          onTitle: (title) => {
            updateAgentChatSessionListItem(queryClient, input.chatSessionId, {
              title,
              title_type: "SYSTEM",
            });
          },
        });
      } catch (error) {
        if (!isReady) {
          queryClient.setQueryData<AgentChatState | undefined>(
            agentChatKeys.session(input.chatSessionId),
            (state) =>
              removeOptimisticUserMessage(
                state,
                options.optimisticUserMessageId,
              ),
          );
        }

        throw error;
      }

      return input.chatSessionId;
    },
  });
}

export function useAgentResumeChatCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { chatSessionId: string; messageId: number }) => {
      try {
        const response = await createAgentResumeChatCompletionRequest(input);
        if (!response.ok) {
          throw new Error("重新接入失败");
        }

        await processAgentChatCompletionStream({
          response,
          updateState: (updater) => {
            queryClient.setQueryData(
              agentChatKeys.session(input.chatSessionId),
              updater,
            );
          },
          onSessionPatch: (patch) => {
            const listPatch = toSessionListPatch(patch);
            if (Object.keys(listPatch).length === 0) return;

            updateAgentChatSessionListItem(
              queryClient,
              input.chatSessionId,
              listPatch,
            );
          },
          onTitle: (title) => {
            updateAgentChatSessionListItem(queryClient, input.chatSessionId, {
              title,
              title_type: "SYSTEM",
            });
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成已中断";

        queryClient.setQueryData<AgentChatState | undefined>(
          agentChatKeys.session(input.chatSessionId),
          (state) => {
            if (!state) return state;

            return produce(state, (draft) => {
              const target = draft.chat_messages.find(
                (chatMessage) =>
                  chatMessage.message_id === input.messageId &&
                  chatMessage.role === "ASSISTANT",
              );

              if (!target || target.status !== "WIP") return;

              target.status = "FAILED";
              target.incomplete_message = message;
              target.has_pending_block = false;
            });
          },
        );

        throw error;
      }

      return input;
    },
  });
}
