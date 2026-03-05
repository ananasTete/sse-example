import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  ChatTree,
  ChatNode,
  ChatMessage,
  EventDelta,
  MessagePart,
} from "../types/chat-advanced";
import { SSEEventProcessor } from "./sse-processor";

interface MessageLimitInfo {
  type: string;
  resetsAt?: number;
  remaining?: number;
  utilization?: number;
}

type MessageStatus = ChatMessage["status"];

interface ProcessStreamOptions {
  targetLeafId: string;
  resetEventSeq?: boolean;
  throwOnError?: boolean;
  suppressErrorStatus?: boolean;
  suppressAbortStatus?: boolean;
  signal?: AbortSignal;
}

interface ProcessStreamResult {
  receivedEvent: boolean;
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

function tryParseJsonObject(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid / partial JSON while streaming.
  }
  return null;
}

function applyDeltaToPart(part: MessagePart, delta: EventDelta): MessagePart {
  if (delta.type === "text_delta") {
    if (part.type !== "text" && part.type !== "reasoning") {
      return part;
    }
    return {
      ...part,
      text: part.text + delta.text,
    };
  }

  if (delta.type === "input_json_delta") {
    if (part.type !== "tool_use") {
      return part;
    }
    const inputJson = part.input_json + delta.partial_json;
    const parsedInput = tryParseJsonObject(inputJson);
    if (!parsedInput) {
      return {
        ...part,
        input_json: inputJson,
      };
    }
    return {
      ...part,
      input_json: inputJson,
      input: parsedInput,
    };
  }

  if (delta.type === "citation_start_delta") {
    if (part.type !== "text") {
      return part;
    }
    return {
      ...part,
      citations: [...(part.citations ?? []), delta.citation],
    };
  }

  return part;
}

function finalizePart(part: MessagePart): MessagePart {
  if (part.type !== "tool_use") {
    return {
      ...part,
      state: "done",
    };
  }

  const parsedInput = tryParseJsonObject(part.input_json);
  if (!parsedInput) {
    return {
      ...part,
      state: "error",
    };
  }

  return {
    ...part,
    state: "done",
    input: parsedInput,
  };
}

export function useAdvancedChat(conversationId: string, initialTree: ChatTree) {
  const [tree, setTree] = useState<ChatTree>(initialTree);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageLimit, setMessageLimit] = useState<MessageLimitInfo | null>(null);

  const abortCtrlRef = useRef<AbortController | null>(null);
  const isResumingRef = useRef(false);
  const streamTargetLeafIdRef = useRef<string | null>(null);
  const lastEventSeqRef = useRef(0);
  const treeRef = useRef(tree);

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  useEffect(() => {
    return () => {
      if (abortCtrlRef.current) {
        abortCtrlRef.current.abort();
        abortCtrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setTree(initialTree);
    setIsStreaming(false);
    setMessageLimit(null);
    isResumingRef.current = false;
    streamTargetLeafIdRef.current = null;
    lastEventSeqRef.current = 0;
  }, [conversationId, initialTree]);

  const patchLeafMessage = useCallback(
    (
      targetLeafId: string,
      updater: (message: NonNullable<ChatNode["message"]>) => NonNullable<ChatNode["message"]>,
    ) => {
      setTree((prev) => {
        const targetNode = prev.mapping[targetLeafId];
        if (!targetNode?.message) return prev;
        const updatedMessage = updater(targetNode.message);
        if (updatedMessage === targetNode.message) {
          return prev;
        }
        return {
          ...prev,
          mapping: {
            ...prev.mapping,
            [targetLeafId]: {
              ...targetNode,
              message: updatedMessage,
            },
          },
        };
      });
    },
    [],
  );

  const markLeafStatus = useCallback(
    (
      targetLeafId: string,
      status: MessageStatus,
      stopReason: string | null,
    ) => {
      patchLeafMessage(targetLeafId, (message) => {
        if (message.status === status && message.stopReason === stopReason) {
          return message;
        }
        return {
          ...message,
          status,
          stopReason,
        };
      });
    },
    [patchLeafMessage],
  );

  const processStream = useCallback(
    async (
      payload: Record<string, unknown>,
      endpoint: string,
      options: ProcessStreamOptions,
    ): Promise<ProcessStreamResult> => {
      const {
        targetLeafId,
        resetEventSeq = true,
        throwOnError = false,
        suppressErrorStatus = false,
        suppressAbortStatus = false,
        signal,
      } = options;

      if (resetEventSeq) {
        lastEventSeqRef.current = 0;
      }
      streamTargetLeafIdRef.current = targetLeafId;

      setIsStreaming(true);
      const controller = new AbortController();
      abortCtrlRef.current = controller;
      let receivedEvent = false;

      const pendingDeltasByIndex = new Map<number, EventDelta[]>();
      let hasScheduledDeltaFlush = false;
      let canApplyQueuedDeltas = true;

      const flushPendingDeltas = () => {
        hasScheduledDeltaFlush = false;
        if (!canApplyQueuedDeltas || pendingDeltasByIndex.size === 0) {
          pendingDeltasByIndex.clear();
          return;
        }

        const queuedDeltas = new Map(pendingDeltasByIndex);
        pendingDeltasByIndex.clear();

        patchLeafMessage(targetLeafId, (message) => {
          let updatedParts: MessagePart[] | null = null;

          for (const [index, deltas] of queuedDeltas.entries()) {
            const currentPart = (updatedParts ?? message.parts)[index];
            if (!currentPart) continue;

            let nextPart = currentPart;
            for (const delta of deltas) {
              nextPart = applyDeltaToPart(nextPart, delta);
            }

            if (nextPart !== currentPart) {
              if (!updatedParts) {
                updatedParts = [...message.parts];
              }
              updatedParts[index] = nextPart;
            }
          }

          if (!updatedParts) {
            return message;
          }

          return {
            ...message,
            parts: updatedParts,
          };
        });
      };

      const scheduleDeltaFlush = () => {
        if (hasScheduledDeltaFlush) return;
        hasScheduledDeltaFlush = true;
        queueMicrotask(flushPendingDeltas);
      };

      const handleExternalAbort = () => {
        controller.abort();
      };

      if (signal?.aborted) {
        handleExternalAbort();
      } else if (signal) {
        signal.addEventListener("abort", handleExternalAbort);
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`API Request Failed: ${response.status}`);
        }

        const processor = new SSEEventProcessor({
          onEvent: (event) => {
            receivedEvent = true;
            if (typeof event.seq === "number") {
              lastEventSeqRef.current = Math.max(lastEventSeqRef.current, event.seq);
            }
          },
          onContentBlockStart: (index, block) => {
            patchLeafMessage(targetLeafId, (message) => {
              const updatedParts = [...message.parts];

              if (block.type === "text" || block.type === "reasoning") {
                updatedParts[index] = {
                  type: block.type,
                  text: "",
                  state: "streaming",
                };
              } else if (block.type === "tool_use") {
                updatedParts[index] = {
                  type: "tool_use",
                  tool_name: block.name || "unknown",
                  tool_use_id: block.id || "",
                  input_json: "",
                  state: "streaming",
                };
              } else if (block.type === "tool_result") {
                updatedParts[index] = {
                  type: "tool_result",
                  tool_use_id: block.id || "",
                  content: block.content || [],
                  state: "streaming",
                };
              }

              return {
                ...message,
                parts: updatedParts,
              };
            });
          },
          onContentBlockDelta: (index, delta) => {
            const queueForIndex = pendingDeltasByIndex.get(index);
            if (queueForIndex) {
              queueForIndex.push(delta);
            } else {
              pendingDeltasByIndex.set(index, [delta]);
            }
            scheduleDeltaFlush();
          },
          onContentBlockStop: (index) => {
            flushPendingDeltas();
            patchLeafMessage(targetLeafId, (message) => {
              const existingPart = message.parts[index];
              if (!existingPart) return message;

              const updatedPart = finalizePart(existingPart);
              if (updatedPart === existingPart) {
                return message;
              }

              const updatedParts = [...message.parts];
              updatedParts[index] = updatedPart;
              return {
                ...message,
                parts: updatedParts,
              };
            });
          },
          onMessageDelta: (delta) => {
            if (delta.stop_reason === undefined) return;
            patchLeafMessage(targetLeafId, (message) => {
              const nextStopReason = delta.stop_reason ?? null;
              if (message.stopReason === nextStopReason) {
                return message;
              }
              return {
                ...message,
                stopReason: nextStopReason,
              };
            });
          },
          onMessageStop: () => {
            flushPendingDeltas();
            patchLeafMessage(targetLeafId, (message) => ({
              ...message,
              status:
                message.status === "error" || message.status === "aborted"
                  ? message.status
                  : "completed",
            }));
          },
          onMessageLimit: (limitInfo) => {
            setMessageLimit(limitInfo);
          },
          onError: (errInfo) => {
            flushPendingDeltas();
            console.error("Stream returned out of band error:", errInfo);
            markLeafStatus(targetLeafId, "error", "error");
          },
        });

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          processor.feed(value);
        }
      } catch (err: unknown) {
        if (isAbortError(err)) {
          if (!suppressAbortStatus) {
            markLeafStatus(targetLeafId, "aborted", "user_abort");
          }
        } else {
          console.error("推流中断或发生错误：", err);
          if (!suppressErrorStatus) {
            markLeafStatus(targetLeafId, "error", "error");
          }
        }

        if (throwOnError) {
          throw err;
        }
      } finally {
        if (signal) {
          signal.removeEventListener("abort", handleExternalAbort);
        }
        if (signal?.aborted) {
          canApplyQueuedDeltas = false;
        }
        flushPendingDeltas();

        setIsStreaming(false);
        streamTargetLeafIdRef.current = null;
        if (abortCtrlRef.current === controller) {
          abortCtrlRef.current = null;
        }
      }

      return { receivedEvent };
    },
    [markLeafStatus, patchLeafMessage],
  );

  const currentLeafId = tree.currentLeafId;
  const currentLeafStatus = tree.mapping[currentLeafId]?.message?.status;

  useEffect(() => {
    if (
      currentLeafStatus !== "in_progress" ||
      isStreaming ||
      streamTargetLeafIdRef.current === currentLeafId ||
      isResumingRef.current
    ) {
      return;
    }

    const resumeLeafId = currentLeafId;
    const resumeAbortController = new AbortController();
    let cancelled = false;
    isResumingRef.current = true;

    const checkAndResume = async () => {
      try {
        const result = await processStream(
          { leafId: resumeLeafId, afterSeq: lastEventSeqRef.current },
          `/api/advanced-chat/${conversationId}/resume`,
          {
            targetLeafId: resumeLeafId,
            resetEventSeq: false,
            throwOnError: true,
            suppressErrorStatus: true,
            suppressAbortStatus: true,
            signal: resumeAbortController.signal,
          },
        );

        if (cancelled) return;
        if (!result.receivedEvent) {
          markLeafStatus(resumeLeafId, "aborted", "resume_stale");
        }
      } catch (error: unknown) {
        if (cancelled || isAbortError(error)) return;

        if (error instanceof Error && error.message.includes("410")) {
          const res = await fetch(`/api/advanced-chat/${conversationId}`, {
            signal: resumeAbortController.signal,
          });
          if (cancelled || resumeAbortController.signal.aborted || !res.ok) return;

          const latestTree = (await res.json()) as ChatTree;
          if (cancelled) return;

          const leaf = latestTree.mapping[latestTree.currentLeafId];
          if (leaf?.message?.status === "in_progress") {
            const updatedLeaf: ChatNode = {
              ...leaf,
              message: {
                ...leaf.message,
                status: "aborted",
                stopReason: "resume_stale",
              },
            };
            setTree({
              ...latestTree,
              mapping: {
                ...latestTree.mapping,
                [latestTree.currentLeafId]: updatedLeaf,
              },
            });
          } else {
            setTree(latestTree);
          }
        }
      } finally {
        if (!cancelled) {
          isResumingRef.current = false;
        }
      }
    };

    void checkAndResume();

    return () => {
      cancelled = true;
      isResumingRef.current = false;
      resumeAbortController.abort();
    };
  }, [
    conversationId,
    currentLeafId,
    currentLeafStatus,
    isStreaming,
    markLeafStatus,
    processStream,
  ]);

  const activeThread = useMemo(() => {
    const thread: ChatNode[] = [];
    let currId = tree.currentLeafId;
    const visited = new Set<string>();

    while (currId && tree.mapping[currId]) {
      if (visited.has(currId)) {
        console.error("Detected cycle in chat tree! Force breaking the loop.", currId);
        break;
      }
      visited.add(currId);

      const node = tree.mapping[currId];
      if (node.role !== "root") thread.unshift(node);

      if (node.parentId === currId) {
        console.error("Self-referencing parentId detected:", currId);
        break;
      }
      if (!node.parentId) {
        break;
      }
      currId = node.parentId;
    }
    return thread;
  }, [tree]);

  const append = useCallback(async (text: string): Promise<boolean> => {
    if (abortCtrlRef.current) {
      return false;
    }

    const humanId = uuidv4();
    const assistantId = uuidv4();
    const snapshot = treeRef.current;
    const parentId = snapshot.currentLeafId || snapshot.rootId;
    if (!snapshot.mapping[parentId]) {
      return false;
    }
    // Reserve stream target before optimistic state update to avoid
    // the auto-resume effect racing in and starting a parallel request.
    streamTargetLeafIdRef.current = assistantId;

    setTree((prev) => {
      const parentNode = prev.mapping[parentId];
      if (!parentNode) return prev;
      return {
        ...prev,
        currentLeafId: assistantId,
        mapping: {
          ...prev.mapping,
          [parentId]: {
            ...parentNode,
            childIds: [...parentNode.childIds, humanId],
          },
          [humanId]: {
            id: humanId,
            parentId,
            childIds: [assistantId],
            role: "user",
            message: {
              id: humanId,
              role: "user",
              status: "completed",
              stopReason: null,
              parts: [{ type: "text", text, state: "done" }],
              createdAt: new Date().toISOString(),
            },
          },
          [assistantId]: {
            id: assistantId,
            parentId: humanId,
            childIds: [],
            role: "assistant",
            message: {
              id: assistantId,
              role: "assistant",
              status: "in_progress",
              stopReason: null,
              parts: [],
              createdAt: new Date().toISOString(),
            },
          },
        },
      };
    });

    await processStream(
      {
        prompt: text,
        parentId,
        turn_message_uuids: { human: humanId, assistant: assistantId },
      },
      `/api/advanced-chat/${conversationId}/completion`,
      { targetLeafId: assistantId, resetEventSeq: true },
    );
    return true;
  }, [conversationId, processStream]);

  const reload = useCallback(async (): Promise<boolean> => {
    if (abortCtrlRef.current) {
      return false;
    }

    const snapshot = treeRef.current;
    const currentAssistantNode = snapshot.mapping[snapshot.currentLeafId];
    if (!currentAssistantNode || currentAssistantNode.role !== "assistant") {
      return false;
    }
    const userQuestionId = currentAssistantNode.parentId;
    if (!userQuestionId) {
      return false;
    }

    const newAssistantId = uuidv4();
    streamTargetLeafIdRef.current = newAssistantId;

    setTree((prev) => {
      const userNode = prev.mapping[userQuestionId];
      if (!userNode) return prev;
      return {
        ...prev,
        currentLeafId: newAssistantId,
        mapping: {
          ...prev.mapping,
          [userQuestionId]: {
            ...userNode,
            childIds: [...userNode.childIds, newAssistantId],
          },
          [newAssistantId]: {
            id: newAssistantId,
            parentId: userQuestionId,
            childIds: [],
            role: "assistant",
            message: {
              id: newAssistantId,
              role: "assistant",
              status: "in_progress",
              stopReason: null,
              parts: [],
              createdAt: new Date().toISOString(),
            },
          },
        },
      };
    });

    await processStream(
      {
        parentId: userQuestionId,
        mode: "retry",
        turn_message_uuids: { assistant: newAssistantId },
      },
      `/api/advanced-chat/${conversationId}/completion`,
      { targetLeafId: newAssistantId, resetEventSeq: true },
    );
    return true;
  }, [conversationId, processStream]);

  const abort = useCallback(() => {
    const targetLeafId = streamTargetLeafIdRef.current;
    if (targetLeafId) {
      void fetch(`/api/advanced-chat/${conversationId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leafId: targetLeafId, action: "cancel" }),
      }).catch((error) => {
        console.error("Failed to cancel stream on server:", error);
      });
    }
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
  }, [conversationId]);

  const switchBranch = useCallback(
    (targetId: string) => {
      if (abortCtrlRef.current) {
        abort();
      }
      setTree((prev) =>
        prev.currentLeafId === targetId
          ? prev
          : {
              ...prev,
              currentLeafId: targetId,
            },
      );
    },
    [abort],
  );

  return {
    activeThread,
    append,
    reload,
    switchBranch,
    abort,
    isStreaming,
    messageLimit,
    tree,
    setTree,
  };
}
