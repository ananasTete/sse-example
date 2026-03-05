import { useState, useMemo, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  ChatTree,
  ChatNode,
} from "../types/chat-advanced";
import { SSEEventProcessor } from "./sse-processor";

export function useAdvancedChat(conversationId: string, initialTree: ChatTree) {
  const [tree, setTree] = useState<ChatTree>(initialTree);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageLimit, setMessageLimit] = useState<Record<string, unknown> | null>(null);

  const abortCtrlRef = useRef<AbortController | null>(null);
  const isResumingRef = useRef(false);

  useEffect(() => {
    const checkAndResume = async () => {
      const currentLeaf = tree.mapping[tree.currentLeafId];
      if (currentLeaf?.message?.status === "in_progress" && !isStreaming && !isResumingRef.current) {
        isResumingRef.current = true;
        console.log("检测到中断的流，尝试重连...", currentLeaf.id);

        try {
          await processStream(
            { leafId: currentLeaf.id },
            `/api/advanced-chat/${conversationId}/resume`,
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.message.includes("410")) {
            const res = await fetch(`/api/advanced-chat/${conversationId}`);
            if (res.ok) {
              const latestTree = await res.json();
              setTree(latestTree);
            }
          }
        } finally {
          isResumingRef.current = false;
        }
      }
    };

    checkAndResume();
  }, [conversationId, tree.mapping, tree.currentLeafId, isStreaming]);

  // 【视图派生】 O(深度)，极其高效
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
      
      // 防止自环导致死循环
      if (node.parentId === currId) {
        console.error("Self-referencing parentId detected:", currId);
        break;
      }
      currId = node.parentId!;
    }
    return thread;
  }, [tree]);

  const processStream = async (
    payload: Record<string, unknown>,
    endpoint: string,
  ) => {
    setIsStreaming(true);
    abortCtrlRef.current = new AbortController();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortCtrlRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`API Request Failed: ${response.status}`);
      }

      const processor = new SSEEventProcessor({
        onMessageStart: () => {
           // 可选处理
        },
        onContentBlockStart: (index, block) => {
          setTree((prev) => {
            const currentLeafId = prev.currentLeafId;
            const targetNode = prev.mapping[currentLeafId];
            if (!targetNode?.message) return prev;
            
            const updatedMessage = {
              ...targetNode.message,
              parts: [...targetNode.message.parts],
            };
            
            if (block.type === "text" || block.type === "reasoning") {
              updatedMessage.parts[index] = { type: block.type, text: "", state: "streaming" };
            } else if (block.type === "tool_use") {
              updatedMessage.parts[index] = { type: "tool_use", tool_name: block.name || "unknown", tool_use_id: block.id || "", input_json: "", state: "streaming" };
            } else if (block.type === "tool_result") {
              // 工具结果通常是作为预先加载的完整数据结构，非流式逐字出现
              updatedMessage.parts[index] = { type: "tool_result", tool_use_id: block.id || "", content: (block as any).content || [], state: "streaming" };
            }
            
            return {
              ...prev,
              mapping: { ...prev.mapping, [currentLeafId]: { ...targetNode, message: updatedMessage } },
            };
          });
        },
        onContentBlockDelta: (index, delta) => {
          setTree((prev) => {
            const currentLeafId = prev.currentLeafId;
            const targetNode = prev.mapping[currentLeafId];
            if (!targetNode?.message) return prev;
            
            const existingPartRef = targetNode.message.parts[index];
            if (!existingPartRef) return prev;
            
            // 复制一个新 part 取代旧 part
            const updatedPart = { ...existingPartRef } as Exclude<typeof existingPartRef, undefined>;
            
            if (delta.type === "text_delta" && (updatedPart.type === "text" || updatedPart.type === "reasoning")) {
              updatedPart.text += delta.text;
            } else if (delta.type === "input_json_delta" && updatedPart.type === "tool_use") {
              updatedPart.input_json += delta.partial_json;
              try { updatedPart.input = JSON.parse(updatedPart.input_json); } catch { /* ignore */ }
            } else if (delta.type === "citation_start_delta" && updatedPart.type === "text") {
              if (!updatedPart.citations) updatedPart.citations = [];
              updatedPart.citations.push(delta.citation);
            }
            
            const updatedMessage = { ...targetNode.message, parts: [...targetNode.message.parts] };
            updatedMessage.parts[index] = updatedPart;

            return {
              ...prev,
              mapping: { ...prev.mapping, [currentLeafId]: { ...targetNode, message: updatedMessage } },
            };
          });
        },
        onContentBlockStop: (index) => {
          setTree((prev) => {
            const currentLeafId = prev.currentLeafId;
            const targetNode = prev.mapping[currentLeafId];
            if (!targetNode?.message) return prev;
            
            const existingPartRef = targetNode.message.parts[index];
            if (!existingPartRef) return prev;
            
            const updatedPart = { ...existingPartRef, state: "done" } as Exclude<typeof existingPartRef, undefined>;
            if (updatedPart.type === "tool_use") {
              try { updatedPart.input = JSON.parse(updatedPart.input_json); } catch { updatedPart.state = "error"; }
            }
            
            const updatedMessage = { ...targetNode.message, parts: [...targetNode.message.parts] };
            updatedMessage.parts[index] = updatedPart;

            return {
              ...prev,
              mapping: { ...prev.mapping, [currentLeafId]: { ...targetNode, message: updatedMessage } },
            };
          });
        },
        onMessageDelta: (delta) => {
          if (delta.stop_reason) {
            setTree((prev) => {
              const currentLeafId = prev.currentLeafId;
              const targetNode = prev.mapping[currentLeafId];
              if (!targetNode?.message) return prev;
              const updatedMessage = { ...targetNode.message, stopReason: delta.stop_reason ?? null };
              return { ...prev, mapping: { ...prev.mapping, [currentLeafId]: { ...targetNode, message: updatedMessage } } };
            });
          }
        },
        onMessageStop: () => {
          setTree((prev) => {
            const currentLeafId = prev.currentLeafId;
            const targetNode = prev.mapping[currentLeafId];
            if (!targetNode?.message) return prev;
            const updatedMessage = { ...targetNode.message, status: "completed" as const };
            return { ...prev, mapping: { ...prev.mapping, [currentLeafId]: { ...targetNode, message: updatedMessage } } };
          });
        },
        onMessageLimit: (limitInfo) => {
          console.warn("Out of band event received: messageLimit", limitInfo);
          setMessageLimit(limitInfo);
        },
        onError: (errInfo) => {
          console.error("Stream returned out of band error:", errInfo);
          failCurrentLeaf();
        }
      });

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        processor.feed(value);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("用户主动中断了流。");
        // 可以在这里将 currentLeafId 对应的节点状态改为 'completed'
      } else {
        console.error("推流中断或发生错误：", err);
        failCurrentLeaf();
      }
    } finally {
      setIsStreaming(false);
      abortCtrlRef.current = null;
    }
  };

  const failCurrentLeaf = () => {
    setTree((prev) => {
      const leaf = prev.mapping[prev.currentLeafId];
      if (!leaf?.message) return prev;
      return {
        ...prev,
        mapping: {
          ...prev.mapping,
          [prev.currentLeafId]: {
            ...leaf,
            message: { ...leaf.message, status: "error" as const },
          },
        },
      };
    });
  };

  const append = async (text: string) => {
    const humanId = uuidv4();
    const assistantId = uuidv4();
    const parentId = tree.currentLeafId || tree.rootId;

    // 乐观 UI 挂载：构造新节点插入 Mapping，并修改 childIds 关系
    setTree((prev) => {
      const parentNode = prev.mapping[parentId];
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
    );
  };

  const reload = async () => {
    const currentAssistantNode = tree.mapping[tree.currentLeafId];
    if (!currentAssistantNode || currentAssistantNode.role !== "assistant")
      return;
    const userQuestionId = currentAssistantNode.parentId;
    if (!userQuestionId) return;

    const newAssistantId = uuidv4();

    setTree((prev) => {
      const userNode = prev.mapping[userQuestionId];
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
    );
  };

  const switchBranch = (targetId: string) => {
    setTree((prev) => ({ ...prev, currentLeafId: targetId }));
    // fetch(`/api/advanced-chat/${conversationId}/sync_leaf`, { method: "PUT", body: JSON.stringify({ leafId: targetId }) });
  };

  const abort = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
  };

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
