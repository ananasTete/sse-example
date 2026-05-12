import { useMutation, useQueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { createUserMessage } from "../stream/messages";
import { processChatCompletionStream } from "../stream/stream";
import type { ChatSessionListItem, ChatSessionPatch, ChatState } from "../types";
import { chatKeys } from "./keys";
import { updateChatSessionListItem } from "./useChatSessionList";

export async function createChatCompletionRequest(input: {
  chatSessionId: string;
  prompt: string;
  parentMessageId: number | null;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
}) {
  return fetch("/chat/completion", {
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

export async function createResumeChatCompletionRequest(input: {
  chatSessionId: string;
  messageId: number;
}) {
  return fetch("/api/v0/chat/resume_stream", {
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
  state: ChatState | undefined,
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
  patch: ChatSessionPatch,
): Partial<Omit<ChatSessionListItem, "id">> {
  const listPatch: Partial<Omit<ChatSessionListItem, "id">> = {};

  if ("title" in patch) listPatch.title = patch.title ?? null;
  if (patch.title_type !== undefined) listPatch.title_type = patch.title_type;
  if (patch.pinned !== undefined) listPatch.pinned = patch.pinned;
  if (patch.updated_at !== undefined) listPatch.updated_at = patch.updated_at;
  if (patch.seq_id !== undefined) listPatch.seq_id = patch.seq_id;

  return listPatch;
}

export function useChatCompletion() {
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

      // 乐观更新用户消息
      queryClient.setQueryData<ChatState | undefined>(
        chatKeys.session(input.chatSessionId),
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
        const response = await createChatCompletionRequest(options);
        if (!response.ok) {
          throw new Error("生成失败");
        }

        // 处理 SSE 响应
        await processChatCompletionStream({
          response,
          updateState: (updater) => {
            queryClient.setQueryData(
              chatKeys.session(input.chatSessionId),
              updater,
            );
          },
          onReady: (payload) => {
            isReady = true;

            queryClient.setQueryData<ChatState | undefined>(
              chatKeys.session(input.chatSessionId),
              (state) => {
                if (!state) return state;

                return produce(state, (draft) => {
                  const optimistic = draft.chat_messages.find(
                    (m) =>
                      m.message_id === options.optimisticUserMessageId &&
                      m.role === "USER",
                  );
                  if (optimistic) {
                    optimistic.message_id = payload.user_message_id;
                    for (const block of optimistic.blocks) {
                      if (block.id === options.optimisticUserMessageId) {
                        block.id = payload.user_message_id;
                      }
                    }
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

            updateChatSessionListItem(
              queryClient,
              input.chatSessionId,
              listPatch,
            );
          },
          onTitle: (title) => {
            const patch = {
              title,
              title_type: "SYSTEM" as const,
            };
            updateChatSessionListItem(queryClient, input.chatSessionId, patch);
          },
        });
      } catch (error) {
        if (!isReady) {
          queryClient.setQueryData<ChatState | undefined>(
            chatKeys.session(input.chatSessionId),
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

export function useResumeChatCompletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { chatSessionId: string; messageId: number }) => {
      try {
        const response = await createResumeChatCompletionRequest(input);
        if (!response.ok) {
          throw new Error("重新接入失败");
        }

        await processChatCompletionStream({
          response,
          updateState: (updater) => {
            queryClient.setQueryData(
              chatKeys.session(input.chatSessionId),
              updater,
            );
          },
          onSessionPatch: (patch) => {
            const listPatch = toSessionListPatch(patch);
            if (Object.keys(listPatch).length === 0) return;

            updateChatSessionListItem(
              queryClient,
              input.chatSessionId,
              listPatch,
            );
          },
          onTitle: (title) => {
            updateChatSessionListItem(queryClient, input.chatSessionId, {
              title,
              title_type: "SYSTEM",
            });
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "生成已中断";

        queryClient.setQueryData<ChatState | undefined>(
          chatKeys.session(input.chatSessionId),
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
