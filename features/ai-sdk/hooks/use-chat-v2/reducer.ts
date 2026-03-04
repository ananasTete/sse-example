import {
  ChatMessageV2,
  ConversationNode,
  ConversationStateV2,
  MessagePartV2,
  UseChatV2Status,
} from "./types";

export interface ChatStateV2 {
  conversation: ConversationStateV2;
  input: string;
  status: UseChatV2Status;
  error: Error | null;
}

export type ChatActionV2 =
  | { type: "SET_INPUT"; payload: string }
  | {
      type: "REPLACE_CONVERSATION";
      payload: {
        conversation: ConversationStateV2;
      };
    }
  | { type: "SET_CURSOR"; payload: { nodeId: string } }
  | { type: "SET_SUBMITTED" }
  | { type: "SET_STREAMING" }
  | { type: "SET_READY" }
  | { type: "SET_ERROR"; payload: Error }
  | {
      type: "ADD_USER_WITH_ASSISTANT_PLACEHOLDER";
      payload: {
        parentId: string;
        userNode: ConversationNode;
        assistantNode: ConversationNode;
      };
    }
  | {
      type: "ADD_ASSISTANT_VARIANT_PLACEHOLDER";
      payload: {
        userNodeId: string;
        assistantNode: ConversationNode;
      };
    }
  | {
      type: "RENAME_ASSISTANT_NODE";
      payload: {
        fromId: string;
        toId: string;
        model?: string;
      };
    }
  | {
      type: "UPDATE_ASSISTANT_MESSAGE";
      payload: {
        nodeId: string;
        updates: Partial<ChatMessageV2>;
      };
    }
  | {
      type: "UPDATE_ASSISTANT_PARTS";
      payload: {
        nodeId: string;
        updater: (parts: MessagePartV2[]) => MessagePartV2[];
      };
    }
  | {
      type: "FINALIZE_STREAMING";
      payload: {
        assistantNodeId: string;
      };
    }
  | {
      type: "ABORT_STREAMING";
      payload: {
        assistantNodeId?: string;
      };
    };

const appendChildId = (childIds: string[], childId: string): string[] => {
  if (childIds.includes(childId)) return [...childIds];
  return [...childIds, childId];
};

const replaceChildId = (
  childIds: string[],
  fromId: string,
  toId: string,
): string[] => {
  return childIds.map((childId) => (childId === fromId ? toId : childId));
};

const finalizeStreamingParts = (parts: MessagePartV2[]): MessagePartV2[] => {
  return parts.map((part) => {
    if (
      (part.type === "text" || part.type === "reasoning") &&
      part.state === "streaming"
    ) {
      return {
        ...part,
        state: "done" as const,
      };
    }

    return part;
  });
};

const updateNode = (
  conversation: ConversationStateV2,
  nodeId: string,
  updater: (node: ConversationNode) => ConversationNode,
): ConversationStateV2 => {
  const target = conversation.mapping[nodeId];
  if (!target) return conversation;

  return {
    ...conversation,
    mapping: {
      ...conversation.mapping,
      [nodeId]: updater(target),
    },
  };
};

export function chatReducerV2(state: ChatStateV2, action: ChatActionV2): ChatStateV2 {
  switch (action.type) {
    case "REPLACE_CONVERSATION":
      return {
        ...state,
        conversation: action.payload.conversation,
        status: "ready",
      };

    case "SET_INPUT":
      return {
        ...state,
        input: action.payload,
      };

    case "SET_CURSOR": {
      if (!state.conversation.mapping[action.payload.nodeId]) {
        return state;
      }

      return {
        ...state,
        conversation: {
          ...state.conversation,
          cursorId: action.payload.nodeId,
        },
      };
    }

    case "SET_SUBMITTED":
      return {
        ...state,
        status: "submitted",
        error: null,
      };

    case "SET_STREAMING":
      return {
        ...state,
        status: "streaming",
      };

    case "SET_READY":
      return {
        ...state,
        status: "ready",
      };

    case "SET_ERROR":
      return {
        ...state,
        status: "error",
        error: action.payload,
      };

    case "ADD_USER_WITH_ASSISTANT_PLACEHOLDER": {
      const { parentId, userNode, assistantNode } = action.payload;
      const parentNode = state.conversation.mapping[parentId];
      if (!parentNode) return state;

      const nextConversation: ConversationStateV2 = {
        ...state.conversation,
        cursorId: assistantNode.id,
        mapping: {
          ...state.conversation.mapping,
          [parentId]: {
            ...parentNode,
            childIds: appendChildId(parentNode.childIds, userNode.id),
          },
          [userNode.id]: {
            ...userNode,
            childIds: appendChildId(userNode.childIds, assistantNode.id),
          },
          [assistantNode.id]: assistantNode,
        },
      };

      return {
        ...state,
        conversation: nextConversation,
        status: "submitted",
        error: null,
      };
    }

    case "ADD_ASSISTANT_VARIANT_PLACEHOLDER": {
      const { userNodeId, assistantNode } = action.payload;
      const userNode = state.conversation.mapping[userNodeId];
      if (!userNode || userNode.role !== "user") return state;

      const nextConversation: ConversationStateV2 = {
        ...state.conversation,
        cursorId: assistantNode.id,
        mapping: {
          ...state.conversation.mapping,
          [userNodeId]: {
            ...userNode,
            childIds: appendChildId(userNode.childIds, assistantNode.id),
          },
          [assistantNode.id]: assistantNode,
        },
      };

      return {
        ...state,
        conversation: nextConversation,
        status: "submitted",
        error: null,
      };
    }

    case "RENAME_ASSISTANT_NODE": {
      const { fromId, toId, model } = action.payload;
      const targetNode = state.conversation.mapping[fromId];
      if (!targetNode || !targetNode.message) return state;

      if (fromId === toId) {
        if (!model) return state;
        return {
          ...state,
          conversation: updateNode(state.conversation, fromId, (node) => ({
            ...node,
            message: node.message
              ? {
                  ...node.message,
                  model,
                }
              : null,
          })),
        };
      }

      if (state.conversation.mapping[toId]) {
        return state;
      }

      const mapping = { ...state.conversation.mapping };
      const nextNode: ConversationNode = {
        ...targetNode,
        id: toId,
        message: targetNode.message
          ? {
              ...targetNode.message,
              id: toId,
              ...(model ? { model } : {}),
            }
          : null,
      };

      delete mapping[fromId];
      mapping[toId] = nextNode;

      if (nextNode.parentId) {
        const parent = mapping[nextNode.parentId];
        if (parent) {
          mapping[nextNode.parentId] = {
            ...parent,
            childIds: replaceChildId(parent.childIds, fromId, toId),
          };
        }
      }

      for (const childId of nextNode.childIds) {
        const child = mapping[childId];
        if (!child) continue;
        mapping[childId] = {
          ...child,
          parentId: toId,
        };
      }

      return {
        ...state,
        conversation: {
          ...state.conversation,
          rootId: state.conversation.rootId === fromId ? toId : state.conversation.rootId,
          cursorId:
            state.conversation.cursorId === fromId ? toId : state.conversation.cursorId,
          mapping,
        },
      };
    }

    case "UPDATE_ASSISTANT_MESSAGE": {
      const { nodeId, updates } = action.payload;
      return {
        ...state,
        conversation: updateNode(state.conversation, nodeId, (node) => {
          if (!node.message) return node;

          return {
            ...node,
            message: {
              ...node.message,
              ...updates,
              id: node.id,
            },
          };
        }),
      };
    }

    case "UPDATE_ASSISTANT_PARTS": {
      const { nodeId, updater } = action.payload;
      return {
        ...state,
        conversation: updateNode(state.conversation, nodeId, (node) => {
          if (!node.message) return node;

          return {
            ...node,
            message: {
              ...node.message,
              parts: updater([...node.message.parts]),
            },
          };
        }),
      };
    }

    case "FINALIZE_STREAMING": {
      const { assistantNodeId } = action.payload;
      const nextConversation = updateNode(
        state.conversation,
        assistantNodeId,
        (node) => {
          if (!node.message) return node;

          return {
            ...node,
            message: {
              ...node.message,
              parts: finalizeStreamingParts(node.message.parts),
            },
          };
        },
      );

      return {
        ...state,
        conversation: nextConversation,
        status: "ready",
      };
    }

    case "ABORT_STREAMING": {
      const assistantNodeId = action.payload.assistantNodeId;
      const nextConversation = assistantNodeId
        ? updateNode(state.conversation, assistantNodeId, (node) => {
            if (!node.message) return node;
            return {
              ...node,
              message: {
                ...node.message,
                parts: finalizeStreamingParts(node.message.parts),
              },
            };
          })
        : state.conversation;

      return {
        ...state,
        conversation: nextConversation,
        status: "ready",
      };
    }

    default:
      return state;
  }
}
