import { ChangeEvent, FormEvent, useEffect, useMemo, useReducer, useRef } from "react";
import { nanoid } from "nanoid";
import { chatReducerV2 } from "./reducer";
import { createSSEParserV2 } from "./parser";
import {
  ActiveChatRunV2,
  ChatMessageV2,
  ConversationNode,
  ConversationStateV2,
  OnDataCallbackV2,
  OnErrorCallbackV2,
  OnFinishCallbackV2,
  RequestTrigger,
  StreamChatV2RequestBody,
  StreamChatSettingsV2,
  UseChatV2Status,
  findLatestAssistantNode,
  getChildrenNodes,
  getPathMessages,
  initializeConversationState,
} from "./types";

const generateId = () => nanoid();
const RUN_PROGRESS_STORAGE_PREFIX = "chat-run-progress:v1";

interface CreateChatRunResponse {
  run_id: string;
  assistant_message_id: string;
  resume_token: string;
  last_seq: number;
  status: "running" | "done" | "aborted" | "error";
}

interface RunIdentityV2 {
  id: string;
  assistantMessageId: string;
  resumeToken: string;
  lastSeq: number;
  status: "running" | "done" | "aborted" | "error";
}

const isBrowser = typeof window !== "undefined";

const getRunProgressStorageKey = (chatId: string, runId: string) =>
  `${RUN_PROGRESS_STORAGE_PREFIX}:${chatId}:${runId}`;

const readRunProgress = (chatId: string, runId: string): number | null => {
  if (!isBrowser) return null;

  try {
    const raw = window.localStorage.getItem(getRunProgressStorageKey(chatId, runId));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
  } catch {
    return null;
  }
};

const writeRunProgress = (chatId: string, runId: string, seq: number) => {
  if (!isBrowser) return;

  try {
    window.localStorage.setItem(getRunProgressStorageKey(chatId, runId), String(seq));
  } catch {
    // noop
  }
};

const clearRunProgress = (chatId: string, runId: string) => {
  if (!isBrowser) return;

  try {
    window.localStorage.removeItem(getRunProgressStorageKey(chatId, runId));
  } catch {
    // noop
  }
};

const toRunIdentity = (input: ActiveChatRunV2 | CreateChatRunResponse): RunIdentityV2 => {
  if ("run_id" in input) {
    return {
      id: input.run_id,
      assistantMessageId: input.assistant_message_id,
      resumeToken: input.resume_token,
      lastSeq: input.last_seq,
      status: input.status,
    };
  }

  return {
    id: input.id,
    assistantMessageId: input.assistantMessageId,
    resumeToken: input.resumeToken,
    lastSeq: input.lastSeq,
    status: input.status,
  };
};

const createUserNode = (
  chatId: string,
  text: string,
  parentId: string,
): ConversationNode => {
  const now = new Date().toISOString();
  const id = generateId();

  return {
    id,
    parentId,
    childIds: [],
    role: "user",
    visible: true,
    message: {
      id,
      chatId,
      role: "user",
      createdAt: now,
      parts: [{ type: "text", text, state: "done" }],
    },
  };
};

const createAssistantPlaceholderNode = (
  chatId: string,
  parentId: string,
  model: string,
): ConversationNode => {
  const now = new Date().toISOString();
  const id = generateId();

  return {
    id,
    parentId,
    childIds: [],
    role: "assistant",
    visible: true,
    message: {
      id,
      chatId,
      role: "assistant",
      createdAt: now,
      model,
      parts: [],
    },
  };
};

export interface UseChatV2Options {
  api: string;
  chatId: string;
  model: string;
  headers?: Record<string, string>;
  trigger?: RequestTrigger;
  settings?: StreamChatSettingsV2;
  initialConversation: ConversationStateV2;
  initialActiveRun?: ActiveChatRunV2;
  onFinish?: OnFinishCallbackV2;
  onError?: OnErrorCallbackV2;
  onData?: OnDataCallbackV2;
}

export interface SendMessageOptions {
  parentId?: string;
  trigger?: RequestTrigger;
}

export interface RegenerateOptions {
  assistantMessageId?: string;
}

interface StreamRequestOptions {
  assistantNodeId: string;
  parentId: string;
  message: ChatMessageV2;
  trigger: RequestTrigger;
}

interface RecoveryChatDetailResponse {
  conversation: {
    rootId: string;
    current_leaf_message_id: string;
    mapping: ConversationStateV2["mapping"];
  };
}

interface UseChatV2State {
  conversation: ConversationStateV2;
  input: string;
  status: UseChatV2Status;
  error: Error | null;
}

export function useChatV2({
  api,
  chatId,
  model,
  headers = {},
  trigger = "submit-message",
  settings,
  initialConversation,
  initialActiveRun,
  onFinish,
  onError,
  onData,
}: UseChatV2Options) {
  const [state, dispatch] = useReducer(
    chatReducerV2,
    undefined,
    (): UseChatV2State => ({
      conversation: initializeConversationState(initialConversation),
      input: "",
      status: "ready",
      error: null,
    }),
  );

  const { conversation, input, status, error } = state;

  const activeMessages = useMemo(
    () => getPathMessages(conversation, conversation.cursorId),
    [conversation],
  );

  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const streamingAssistantNodeIdRef = useRef<string | null>(null);
  const activeRunRef = useRef<RunIdentityV2 | null>(null);

  useEffect(() => {
    return () => {
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
    };
  }, []);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    dispatch({ type: "SET_INPUT", payload: e.target.value });
  };

  const setInput = (value: string) => {
    dispatch({ type: "SET_INPUT", payload: value });
  };

  const setCursor = (nodeId: string) => {
    if (!conversationRef.current.mapping[nodeId]) {
      console.warn(`Cursor node not found: ${nodeId}`);
      return;
    }

    dispatch({ type: "SET_CURSOR", payload: { nodeId } });
  };

  const getPathMessagesByNode = (nodeId: string) => {
    if (!conversationRef.current.mapping[nodeId]) return [];
    return getPathMessages(conversationRef.current, nodeId);
  };

  const getChildren = (nodeId: string) => {
    return getChildrenNodes(conversationRef.current, nodeId);
  };

  const recoverConversationFromServer = async () => {
    try {
      const response = await fetch(`${api}/${chatId}`, {
        method: "GET",
        headers,
      });
      if (!response.ok) return;

      const data = (await response.json()) as RecoveryChatDetailResponse;
      if (!data?.conversation?.rootId || !data.conversation.mapping) return;

      const recoveredConversation: ConversationStateV2 = initializeConversationState({
        rootId: data.conversation.rootId,
        cursorId: data.conversation.current_leaf_message_id,
        mapping: data.conversation.mapping,
      });

      dispatch({
        type: "REPLACE_CONVERSATION",
        payload: {
          conversation: recoveredConversation,
        },
      });
    } catch (recoveryError) {
      console.warn("Failed to recover conversation from server", recoveryError);
    }
  };

  const connectToRunStream = async (
    runIdentity: RunIdentityV2,
    assistantNodeId: string,
  ) => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    streamAbortControllerRef.current = controller;
    streamingAssistantNodeIdRef.current = assistantNodeId;
    activeRunRef.current = runIdentity;

    const assistantSnapshot =
      conversationRef.current.mapping[assistantNodeId]?.message;
    const hasLocalAssistantState =
      Boolean(assistantSnapshot?.parts && assistantSnapshot.parts.length > 0);

    const persistedSeq = readRunProgress(chatId, runIdentity.id);
    const serverLastSeq =
      Number.isFinite(runIdentity.lastSeq) && runIdentity.lastSeq > 0
        ? Math.floor(runIdentity.lastSeq)
        : 0;
    let lastSeq = hasLocalAssistantState
      ? (persistedSeq ?? serverLastSeq)
      : 0;

    if (!hasLocalAssistantState) {
      // No local streamed content to apply deltas on top of, replay from the start.
      clearRunProgress(chatId, runIdentity.id);
    }

    let finalAssistantNodeId = assistantNodeId;
    let isAbort = false;
    let isDisconnect = false;

    try {
      const query = new URLSearchParams({
        afterSeq: String(lastSeq),
        resumeToken: runIdentity.resumeToken,
      });

      const response = await fetch(
        `${api}/${chatId}/runs/${runIdentity.id}/stream?${query.toString()}`,
        {
          method: "GET",
          headers,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(response.statusText || "Failed to connect run stream");
      }
      if (!response.body) {
        throw new Error("No response body");
      }

      dispatch({ type: "SET_STREAMING" });

      const { parser, getServerError, getAssistantNodeId } = createSSEParserV2({
        assistantNodeId,
        dispatch,
        onData,
        onSseFrame: ({ id }) => {
          if (!id) return;
          const seq = Number(id);
          if (!Number.isFinite(seq) || seq <= lastSeq) return;
          lastSeq = Math.floor(seq);
          writeRunProgress(chatId, runIdentity.id, lastSeq);
        },
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (controller.signal.aborted) {
          await reader.cancel();
          isAbort = true;
          break;
        }

        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (readError) {
          if (controller.signal.aborted) {
            isAbort = true;
            break;
          }

          isDisconnect = true;
          console.warn("Run stream disconnected:", readError);
          break;
        }

        const { done, value } = readResult;
        if (done) break;

        parser.feed(decoder.decode(value, { stream: true }));
        const serverError = getServerError();
        if (serverError) {
          throw serverError;
        }
      }

      finalAssistantNodeId = getAssistantNodeId();

      dispatch({
        type: "FINALIZE_STREAMING",
        payload: { assistantNodeId: finalAssistantNodeId },
      });

      const completedAssistantParts =
        conversationRef.current.mapping[finalAssistantNodeId]?.message?.parts ?? [];
      if (completedAssistantParts.length === 0) {
        await recoverConversationFromServer();
      }

      if (!isDisconnect) {
        clearRunProgress(chatId, runIdentity.id);
        activeRunRef.current = null;
      }

      queueMicrotask(() => {
        const latestConversation = conversationRef.current;
        const latestMessages = getPathMessages(
          latestConversation,
          latestConversation.cursorId,
        );
        const finalMessage =
          latestConversation.mapping[finalAssistantNodeId]?.message ?? {
            id: finalAssistantNodeId,
            chatId,
            role: "assistant" as const,
            createdAt: new Date().toISOString(),
            model,
            parts: [],
          };

        onFinish?.({
          message: finalMessage,
          messages: latestMessages,
          conversation: latestConversation,
          isAbort,
          isDisconnect,
          isError: false,
        });
      });
    } catch (err) {
      const currentAssistantId = streamingAssistantNodeIdRef.current ?? assistantNodeId;

      if (err instanceof Error && err.name === "AbortError") {
        dispatch({
          type: "ABORT_STREAMING",
          payload: { assistantNodeId: currentAssistantId },
        });

        return;
      }

      console.warn("Run stream failed", {
        chatId,
        runId: runIdentity.id,
        afterSeq: lastSeq,
        error: err instanceof Error ? err.message : String(err),
      });

      dispatch({
        type: "ABORT_STREAMING",
        payload: {
          assistantNodeId: currentAssistantId,
        },
      });

      const errorObj = err instanceof Error ? err : new Error(String(err));
      dispatch({ type: "SET_ERROR", payload: errorObj });
      onError?.(errorObj);

      await recoverConversationFromServer();

      queueMicrotask(() => {
        const latestConversation = conversationRef.current;
        const latestMessages = getPathMessages(
          latestConversation,
          latestConversation.cursorId,
        );
        const fallbackMessage = latestConversation.mapping[currentAssistantId]?.message ?? {
          id: currentAssistantId,
          chatId,
          role: "assistant" as const,
          createdAt: new Date().toISOString(),
          model,
          parts: [],
        };

        onFinish?.({
          message: fallbackMessage,
          messages: latestMessages,
          conversation: latestConversation,
          isAbort: false,
          isDisconnect: false,
          isError: true,
        });
      });
    } finally {
      streamAbortControllerRef.current = null;
      streamingAssistantNodeIdRef.current = null;
    }
  };

  const createRun = async (
    parentId: string,
    message: ChatMessageV2,
    requestTrigger: RequestTrigger,
  ) => {
    const payload: StreamChatV2RequestBody = {
      model,
      trigger: requestTrigger,
      parentId,
      message,
      ...(settings ? { settings } : {}),
    };

    const response = await fetch(`${api}/${chatId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(response.statusText || "Failed to create chat run");
    }

    const data = (await response.json()) as CreateChatRunResponse;
    return toRunIdentity(data);
  };

  const stop = () => {
    const activeRun = activeRunRef.current;

    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }

    dispatch({
      type: "ABORT_STREAMING",
      payload: {
        assistantNodeId:
          streamingAssistantNodeIdRef.current ??
          activeRun?.assistantMessageId ??
          undefined,
      },
    });

    streamingAssistantNodeIdRef.current = null;

    if (!activeRun) return;

    activeRunRef.current = null;
    clearRunProgress(chatId, activeRun.id);

    void fetch(`${api}/${chatId}/runs/${activeRun.id}/cancel`, {
      method: "POST",
      headers,
    }).catch((cancelError) => {
      console.warn("Failed to cancel active run", cancelError);
    });
  };

  const runStreamRequest = async ({
    assistantNodeId,
    parentId,
    message,
    trigger: requestTrigger,
  }: StreamRequestOptions) => {
    const createdRun = await createRun(parentId, message, requestTrigger);

    if (createdRun.assistantMessageId !== assistantNodeId) {
      dispatch({
        type: "RENAME_ASSISTANT_NODE",
        payload: {
          fromId: assistantNodeId,
          toId: createdRun.assistantMessageId,
          model,
        },
      });
    }

    await connectToRunStream(createdRun, createdRun.assistantMessageId);
  };

  useEffect(() => {
    if (!initialActiveRun || initialActiveRun.status !== "running") return;
    if (streamAbortControllerRef.current) return;
    if (activeRunRef.current?.id === initialActiveRun.id) return;

    const snapshot = conversationRef.current;
    if (!snapshot.mapping[initialActiveRun.assistantMessageId]) {
      return;
    }

    const runIdentity = toRunIdentity(initialActiveRun);
    activeRunRef.current = runIdentity;

    dispatch({ type: "SET_STREAMING" });
    void connectToRunStream(runIdentity, runIdentity.assistantMessageId).catch(
      (resumeError) => {
        console.warn("Failed to resume active run", resumeError);
      },
    );
  }, [chatId, initialActiveRun, model]);

  const sendMessage = async (content: string, options?: SendMessageOptions) => {
    if (!content.trim()) return;

    const parentId = options?.parentId ?? conversationRef.current.cursorId;
    if (!conversationRef.current.mapping[parentId]) {
      throw new Error(`parentId ${parentId} not found in conversation mapping`);
    }

    const userNode = createUserNode(chatId, content, parentId);
    const assistantNode = createAssistantPlaceholderNode(chatId, userNode.id, model);

    dispatch({
      type: "ADD_USER_WITH_ASSISTANT_PLACEHOLDER",
      payload: {
        parentId,
        userNode,
        assistantNode,
      },
    });

    await runStreamRequest({
      assistantNodeId: assistantNode.id,
      parentId,
      message: userNode.message as ChatMessageV2,
      trigger: options?.trigger ?? trigger,
    });
  };

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const messageText = input;
    dispatch({ type: "SET_INPUT", payload: "" });
    await sendMessage(messageText, { trigger });
  };

  const regenerate = async (options?: RegenerateOptions) => {
    const conversationSnapshot = conversationRef.current;

    const targetAssistantNode = options?.assistantMessageId
      ? conversationSnapshot.mapping[options.assistantMessageId]
      : findLatestAssistantNode(conversationSnapshot);

    if (!targetAssistantNode || targetAssistantNode.role !== "assistant") {
      console.warn("Assistant node not found for regenerate");
      return;
    }

    if (!targetAssistantNode.parentId) {
      console.warn("Target assistant node has no parent user node");
      return;
    }

    const targetUserNode = conversationSnapshot.mapping[targetAssistantNode.parentId];
    if (
      !targetUserNode ||
      targetUserNode.role !== "user" ||
      !targetUserNode.message
    ) {
      console.warn("Target user node not found for regenerate");
      return;
    }

    if (!targetUserNode.parentId) {
      console.warn("Target user node has no parentId");
      return;
    }

    const variantAssistantNode = createAssistantPlaceholderNode(
      chatId,
      targetUserNode.id,
      model,
    );

    dispatch({
      type: "ADD_ASSISTANT_VARIANT_PLACEHOLDER",
      payload: {
        userNodeId: targetUserNode.id,
        assistantNode: variantAssistantNode,
      },
    });

    await runStreamRequest({
      assistantNodeId: variantAssistantNode.id,
      parentId: targetUserNode.parentId,
      message: targetUserNode.message,
      trigger: "regenerate-message",
    });
  };

  return {
    conversation,
    activeMessages,
    cursorId: conversation.cursorId,
    status,
    error,
    input,
    isLoading: status === "submitted" || status === "streaming",
    handleInputChange,
    setInput,
    setCursor,
    getPathMessages: getPathMessagesByNode,
    getChildren,
    sendMessage,
    handleSubmit,
    regenerate,
    stop,
  };
}
