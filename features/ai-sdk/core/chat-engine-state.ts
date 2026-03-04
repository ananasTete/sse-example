import { produce } from "immer";
import {
  ChatMessageV2,
  ConversationNode,
  ConversationStateV2,
  MessagePartV2,
  UseChatV2Status,
} from "../hooks/use-chat-v2/types";
import {
  cloneConversationState,
  getPathMessages,
} from "../hooks/use-chat-v2/types";

// Polyfill for EventTarget if strictly typing
export class ChatEngineState extends EventTarget {
  public conversation: ConversationStateV2;
  public input: string = "";
  public status: UseChatV2Status = "ready";
  public error: Error | null = null;

  private cachedSnapshot: {
    conversation: ConversationStateV2;
    input: string;
    status: UseChatV2Status;
    error: Error | null;
  };

  private notifyRafId: number | ReturnType<typeof setTimeout> | null = null;

  constructor(initialConversation: ConversationStateV2) {
    super();
    // Ensure we start with a clean, detached clone of the initial state
    this.conversation = cloneConversationState(initialConversation);
    this.cachedSnapshot = {
      conversation: this.conversation,
      input: this.input,
      status: this.status,
      error: this.error,
    };
  }

  // --- Observation ---

  public subscribe(listener: () => void): () => void {
    this.addEventListener("change", listener);
    return () => {
      this.removeEventListener("change", listener);
    };
  }

  public notify(): void {
    if (this.notifyRafId !== null) return;

    const scheduleFn =
      typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame
        : setTimeout;

    this.notifyRafId = scheduleFn(() => {
      this.notifyRafId = null;
      this.cachedSnapshot = {
        conversation: this.conversation,
        input: this.input,
        status: this.status,
        error: this.error,
      };
      this.dispatchEvent(new Event("change"));
    });
  }

  public flushSync(): void {
    if (this.notifyRafId !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.notifyRafId as number);
      } else {
        clearTimeout(this.notifyRafId as ReturnType<typeof setTimeout>);
      }
      this.notifyRafId = null;
    }
    this.cachedSnapshot = {
      conversation: this.conversation,
      input: this.input,
      status: this.status,
      error: this.error,
    };
    this.dispatchEvent(new Event("change"));
  }

  // --- Snapshot Generation (for React) ---

  public getSnapshot() {
    return this.cachedSnapshot;
  }

  public getActiveMessages() {
    return getPathMessages(this.conversation, this.conversation.cursorId);
  }

  // --- State Mutations (powered by Immer) ---

  public setInput(input: string) {
    if (this.input === input) return;
    this.input = input;
    this.notify();
  }

  public setCursor(nodeId: string) {
    if (!this.conversation.mapping[nodeId]) {
      console.warn(`Cursor node not found: ${nodeId}`);
      return;
    }
    if (this.conversation.cursorId === nodeId) return;

    this.conversation = produce(this.conversation, (draft) => {
      draft.cursorId = nodeId;
    });
    this.notify();
  }

  // Helper inside Immer's produce draft
  private appendChildId(childIds: string[], childId: string): void {
    if (!childIds.includes(childId)) {
      childIds.push(childId);
    }
  }

  public addUserWithAssistantPlaceholder(
    parentId: string,
    userNode: ConversationNode,
    assistantNode: ConversationNode,
  ) {
    if (!this.conversation.mapping[parentId]) return;

    this.conversation = produce(this.conversation, (draft) => {
      draft.cursorId = assistantNode.id;

      const parent = draft.mapping[parentId];
      if (parent) {
        this.appendChildId(parent.childIds, userNode.id);
      }

      // Immer works perfectly with native object assigns
      draft.mapping[userNode.id] = userNode as (typeof draft.mapping)[string];
      this.appendChildId(draft.mapping[userNode.id].childIds, assistantNode.id);

      draft.mapping[assistantNode.id] =
        assistantNode as (typeof draft.mapping)[string];
    });

    this.status = "submitted";
    this.error = null;
    this.notify();
  }

  public addAssistantVariantPlaceholder(
    userNodeId: string,
    assistantNode: ConversationNode,
  ) {
    const userNode = this.conversation.mapping[userNodeId];
    if (!userNode || userNode.role !== "user") return;

    this.conversation = produce(this.conversation, (draft) => {
      draft.cursorId = assistantNode.id;

      const draftUserNode = draft.mapping[userNodeId];
      if (draftUserNode) {
        this.appendChildId(draftUserNode.childIds, assistantNode.id);
      }

      draft.mapping[assistantNode.id] =
        assistantNode as (typeof draft.mapping)[string];
    });

    this.status = "submitted";
    this.error = null;
    this.notify();
  }

  public renameAssistantNode(fromId: string, toId: string, model?: string) {
    const targetNode = this.conversation.mapping[fromId];
    if (!targetNode || !targetNode.message) return;

    if (fromId === toId) {
      if (model) {
        this.conversation = produce(this.conversation, (draft) => {
          const node = draft.mapping[fromId];
          if (node && node.message) {
            node.message.model = model;
          }
        });
        this.notify();
      }
      return;
    }

    if (this.conversation.mapping[toId]) return;

    this.conversation = produce(this.conversation, (draft) => {
      const nodeToMove = draft.mapping[fromId];
      if (!nodeToMove) return;

      draft.mapping[toId] = nodeToMove;
      draft.mapping[toId].id = toId;
      if (draft.mapping[toId].message) {
        draft.mapping[toId].message.id = toId;
        if (model) {
          draft.mapping[toId].message.model = model;
        }
      }
      delete draft.mapping[fromId];

      const parentNode = nodeToMove.parentId
        ? draft.mapping[nodeToMove.parentId]
        : null;
      if (parentNode) {
        const idx = parentNode.childIds.indexOf(fromId);
        if (idx !== -1) {
          parentNode.childIds[idx] = toId;
        }
      }

      for (const childId of nodeToMove.childIds) {
        const child = draft.mapping[childId];
        if (child) {
          child.parentId = toId;
        }
      }

      if (draft.rootId === fromId) {
        draft.rootId = toId;
      }
      if (draft.cursorId === fromId) {
        draft.cursorId = toId;
      }
    });

    this.notify();
  }

  public updateAssistantMessage(
    nodeId: string,
    updates: Partial<ChatMessageV2>,
  ) {
    if (!this.conversation.mapping[nodeId]) return;

    this.conversation = produce(this.conversation, (draft) => {
      const targetMessage = draft.mapping[nodeId]?.message;
      if (targetMessage) {
        Object.assign(targetMessage, updates, { id: nodeId });
      }
    });
    this.notify();
  }

  public updateAssistantParts(
    nodeId: string,
    updater: (parts: MessagePartV2[]) => MessagePartV2[],
  ) {
    if (!this.conversation.mapping[nodeId]) return;

    this.conversation = produce(this.conversation, (draft) => {
      const targetMessage = draft.mapping[nodeId]?.message;
      if (targetMessage) {
        targetMessage.parts = updater([...targetMessage.parts]);
      }
    });
    this.notify();
  }

  private finalizeStreamingParts(parts: MessagePartV2[]): void {
    parts.forEach((part) => {
      if (
        (part.type === "text" || part.type === "reasoning") &&
        part.state === "streaming"
      ) {
        part.state = "done";
      }
    });
  }

  public finalizeStreaming(assistantNodeId: string) {
    if (this.conversation.mapping[assistantNodeId]) {
      this.conversation = produce(this.conversation, (draft) => {
        const targetMessage = draft.mapping[assistantNodeId]?.message;
        if (targetMessage && targetMessage.parts) {
          this.finalizeStreamingParts(targetMessage.parts as MessagePartV2[]);
        }
      });
    }
    this.status = "ready";
    this.notify();
  }

  public abortStreaming(assistantNodeId?: string) {
    if (assistantNodeId && this.conversation.mapping[assistantNodeId]) {
      this.conversation = produce(this.conversation, (draft) => {
        const targetMessage = draft.mapping[assistantNodeId]?.message;
        if (targetMessage && targetMessage.parts) {
          this.finalizeStreamingParts(targetMessage.parts as MessagePartV2[]);
        }
      });
    }
    this.status = "ready";
    // For abort streams we might want to flush synchronously to ensure UI reacts
    this.flushSync();
  }

  public setStreaming() {
    this.status = "streaming";
    this.notify();
  }

  public setReady() {
    this.status = "ready";
    this.notify();
  }

  public setError(error: Error) {
    this.status = "error";
    this.error = error;
    this.notify();
  }

  public replaceConversation(conversation: ConversationStateV2) {
    this.conversation = conversation;
    this.status = "ready";
    this.notify();
  }
}
