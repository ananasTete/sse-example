import { ChangeEvent, FormEvent, useEffect, useMemo, useReducer, useRef } from "react";
import { nanoid } from "nanoid";
import { chatReducerV2 } from "./reducer";
import { createSSEParserV2 } from "./parser";
import {
  ChatMessageV2,
  ConversationNode,
  ConversationStateV2,
  OnDataCallbackV2,
  OnErrorCallbackV2,
  OnFinishCallbackV2,
  RequestTrigger,
  StreamChatV2RequestBody,
  UseChatV2Status,
  findLatestAssistantNode,
  getChildrenNodes,
  getPathMessages,
  initializeConversationState,
} from "./types";

const generateId = () => nanoid();

export interface UseChatV2Options {
  api: string;
  chatId: string;
  model: string;
  headers?: Record<string, string>;
  trigger?: RequestTrigger;
  initialConversation: ConversationStateV2;
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

interface UseChatV2State {
  conversation: ConversationStateV2;
  input: string;
  status: UseChatV2Status;
  error: Error | null;
}

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

export function useChatV2({
  api,
  chatId,
  model,
  headers = {},
  trigger = "submit-message",
  initialConversation,
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingAssistantNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
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

  const stop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      dispatch({
        type: "ABORT_STREAMING",
        payload: {
          assistantNodeId: streamingAssistantNodeIdRef.current ?? undefined,
        },
      });
      streamingAssistantNodeIdRef.current = null;
    }
  };

  const runStreamRequest = async ({
    assistantNodeId,
    parentId,
    message,
    trigger: requestTrigger,
  }: StreamRequestOptions) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    streamingAssistantNodeIdRef.current = assistantNodeId;

    try {
      const payload: StreamChatV2RequestBody = {
        model,
        trigger: requestTrigger,
        parentId,
        message,
      };

      const response = await fetch(`${api}/${chatId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }
      if (!response.body) {
        throw new Error("No response body");
      }

      dispatch({ type: "SET_STREAMING" });

      const { parser, getServerError, getAssistantNodeId } = createSSEParserV2({
        assistantNodeId,
        dispatch,
        onData,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let isAbort = false;
      let isDisconnect = false;

      while (true) {
        if (abortController.signal.aborted) {
          await reader.cancel();
          isAbort = true;
          break;
        }

        try {
          const { done, value } = await reader.read();
          if (done) break;

          parser.feed(decoder.decode(value, { stream: true }));
          const serverError = getServerError();
          if (serverError) throw serverError;
        } catch (readError) {
          if (abortController.signal.aborted) {
            isAbort = true;
            break;
          }

          isDisconnect = true;
          console.warn("Connection disconnected:", readError);
          break;
        }
      }

      const finalAssistantNodeId = getAssistantNodeId();
      dispatch({
        type: "FINALIZE_STREAMING",
        payload: { assistantNodeId: finalAssistantNodeId },
      });

      queueMicrotask(() => {
        const latestConversation = conversationRef.current;
        const latestMessages = getPathMessages(
          latestConversation,
          latestConversation.cursorId,
        );
        const finalMessage = latestConversation.mapping[finalAssistantNodeId]?.message ?? {
          id: finalAssistantNodeId,
          chatId,
          role: "assistant",
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
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({
          type: "ABORT_STREAMING",
          payload: {
            assistantNodeId: streamingAssistantNodeIdRef.current ?? undefined,
          },
        });
        return;
      }

      const errorObj = err instanceof Error ? err : new Error(String(err));
      dispatch({ type: "SET_ERROR", payload: errorObj });
      onError?.(errorObj);

      queueMicrotask(() => {
        const latestConversation = conversationRef.current;
        const latestMessages = getPathMessages(
          latestConversation,
          latestConversation.cursorId,
        );
        const currentAssistantId = streamingAssistantNodeIdRef.current ?? assistantNodeId;
        const fallbackMessage = latestConversation.mapping[currentAssistantId]?.message ?? {
          id: currentAssistantId,
          chatId,
          role: "assistant",
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
      abortControllerRef.current = null;
      streamingAssistantNodeIdRef.current = null;
    }
  };

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
