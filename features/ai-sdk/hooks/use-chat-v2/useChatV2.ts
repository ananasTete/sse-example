import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { ChatStateV2, chatReducerV2 } from "./reducer";
import {
  connectToRunStreamWithRecovery,
  recoverChatDetailSnapshotFromServer,
  shouldAttemptSnapshotRecovery,
} from "./run-session";
import type { RunStreamFinishFlags } from "./run-session";
import {
  ActiveChatRunV2,
  ChatMessageV2,
  ConversationStateV2,
  OnDataCallbackV2,
  OnErrorCallbackV2,
  OnFinishCallbackV2,
  RequestTrigger,
  StreamChatV2RequestBody,
  StreamChatSettingsV2,
  findLatestAssistantNode,
  getChildrenNodes,
  getPathMessages,
  initializeConversationState,
} from "./types";
import {
  CreateChatRunResponse,
  RunIdentityV2,
  StreamAbortReason,
  clearAppliedSeqForRun,
  createAssistantPlaceholderNode,
  createUserNode,
  getAppliedSeqForRun,
  isStreamAbortReason,
  setAppliedSeqForRun,
  toRunIdentity,
} from "./runtime";

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
    (): ChatStateV2 => ({
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
  const streamOwnerRef = useRef<string | null>(null);
  const streamAbortReasonRef = useRef<StreamAbortReason | null>(null);
  const streamingAssistantNodeIdRef = useRef<string | null>(null);
  const activeRunRef = useRef<RunIdentityV2 | null>(null);
  const runAppliedSeqRef = useRef<Map<string, number>>(new Map());

  const getAppliedSeq = (runId: string) =>
    getAppliedSeqForRun(runAppliedSeqRef.current, runId);

  const setAppliedSeq = (runId: string, seq: number) => {
    setAppliedSeqForRun(runAppliedSeqRef.current, runId, seq);
  };

  const clearAppliedSeq = (runId: string) => {
    clearAppliedSeqForRun(runAppliedSeqRef.current, runId);
  };

  const getAbortReason = (signal?: AbortSignal): StreamAbortReason => {
    const signalReason = (signal as AbortSignal & { reason?: unknown } | undefined)
      ?.reason;
    if (isStreamAbortReason(signalReason)) {
      return signalReason;
    }
    return streamAbortReasonRef.current ?? "unknown";
  };

  const abortActiveStream = useCallback(
    (reason: Exclude<StreamAbortReason, "unknown">) => {
      const controller = streamAbortControllerRef.current;
      if (!controller) return;

      streamAbortReasonRef.current = reason;
      console.info("Abort run stream", {
        chatId,
        runId: activeRunRef.current?.id ?? null,
        reason,
      });

      if (!controller.signal.aborted) {
        (
          controller as AbortController & {
            abort: (reason?: unknown) => void;
          }
        ).abort(reason);
      }

      streamAbortControllerRef.current = null;
    },
    [chatId],
  );

  useEffect(() => {
    return () => {
      abortActiveStream("hook-unmount");
    };
  }, [abortActiveStream]);

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

  const emitFinish = (assistantNodeId: string, flags: RunStreamFinishFlags) => {
    queueMicrotask(() => {
      const latestConversation = conversationRef.current;
      const latestMessages = getPathMessages(
        latestConversation,
        latestConversation.cursorId,
      );
      const finalMessage = latestConversation.mapping[assistantNodeId]?.message ?? {
        id: assistantNodeId,
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
        isAbort: flags.isAbort,
        isDisconnect: flags.isDisconnect,
        isError: flags.isError,
      });
    });
  };

  const recoverChatDetailFromServer = (options?: { applyConversation?: boolean }) =>
    recoverChatDetailSnapshotFromServer({
      api,
      chatId,
      headers,
      dispatch,
      setAppliedSeq,
      options,
    });

  const connectToRunStream = (
    initialRunIdentity: RunIdentityV2,
    initialAssistantNodeId: string,
  ) =>
    connectToRunStreamWithRecovery({
      api,
      chatId,
      headers,
      dispatch,
      refs: {
        conversationRef,
        streamAbortControllerRef,
        streamOwnerRef,
        streamAbortReasonRef,
        streamingAssistantNodeIdRef,
        activeRunRef,
      },
      initialRunIdentity,
      initialAssistantNodeId,
      onData,
      onError,
      abortActiveStream,
      getAbortReason,
      getAppliedSeq,
      setAppliedSeq,
      clearAppliedSeq,
      recoverChatDetailFromServer,
      emitFinish,
    });

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

    abortActiveStream("manual-stop");

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
    clearAppliedSeq(activeRun.id);

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

  const resumeRun = (runIdentity: RunIdentityV2, logPrefix: string) => {
    activeRunRef.current = runIdentity;
    setAppliedSeq(runIdentity.id, runIdentity.lastPersistedSeq);

    void connectToRunStream(runIdentity, runIdentity.assistantMessageId).catch(
      (resumeError) => {
        console.warn(logPrefix, resumeError);
      },
    );
  };

  useEffect(() => {
    if (!initialActiveRun || initialActiveRun.status !== "running") return;
    if (streamAbortControllerRef.current) return;

    const snapshot = conversationRef.current;
    if (!snapshot.mapping[initialActiveRun.assistantMessageId]) {
      return;
    }

    const runIdentity = toRunIdentity(initialActiveRun);
    resumeRun(runIdentity, "Failed to resume active run");
  }, [chatId, initialActiveRun, model]);

  useEffect(() => {
    if (streamAbortControllerRef.current) return;

    const snapshot = conversationRef.current;
    if (!shouldAttemptSnapshotRecovery(snapshot, initialActiveRun?.status)) return;

    let disposed = false;

    console.info("Detected stale streaming snapshot without active run; reconciling", {
      chatId,
    });

    void recoverChatDetailFromServer({ applyConversation: true }).then((recovered) => {
      if (disposed || !recovered) return;

      const recoveredRun = recovered.activeRun;
      if (
        recoveredRun &&
        recoveredRun.status === "running" &&
        recovered.conversation.mapping[recoveredRun.assistantMessageId] &&
        !streamAbortControllerRef.current
      ) {
        resumeRun(
          recoveredRun,
          "Failed to resume run after snapshot reconciliation",
        );
      }
    });

    return () => {
      disposed = true;
    };
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
