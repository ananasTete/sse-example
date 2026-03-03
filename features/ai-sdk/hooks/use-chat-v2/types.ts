export type PartState = "streaming" | "done";

export type ToolCallState =
  | "streaming-input"
  | "input-available"
  | "output-available";

export interface ToolCallPartV2 {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  state: ToolCallState;
  inputText?: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

export type MessagePartV2 =
  | { type: "step-start" }
  | { type: "reasoning"; text: string; state: PartState }
  | { type: "text"; text: string; state: PartState }
  | { type: "image"; imageUrl: string }
  | { type: "source-url"; title: string; url: string }
  | { type: "file"; mediaType: string; filename: string; url: string }
  | ToolCallPartV2;

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessageV2 {
  id: string;
  role: MessageRole;
  parts: MessagePartV2[];
  createdAt: string;
  chatId?: string;
  model?: string;
}

export type ConversationNodeRole = "root" | MessageRole;

export interface ConversationNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  role: ConversationNodeRole;
  message: ChatMessageV2 | null;
  visible: boolean;
}

export interface ConversationStateV2 {
  rootId: string;
  cursorId: string;
  mapping: Record<string, ConversationNode>;
}

export type UseChatV2Status = "submitted" | "streaming" | "ready" | "error";

export type RequestTrigger = "submit-message" | "regenerate-message";

export interface StreamChatV2RequestBody {
  model: string;
  trigger: RequestTrigger;
  parentId: string;
  message: ChatMessageV2;
}

export interface OnFinishV2Params {
  message: ChatMessageV2;
  messages: ChatMessageV2[];
  conversation: ConversationStateV2;
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

export type OnFinishCallbackV2 = (params: OnFinishV2Params) => void;

export type OnErrorCallbackV2 = (error: Error) => void;

export type OnDataCallbackV2 = (data: string) => void;

const clonePart = (part: MessagePartV2): MessagePartV2 => {
  if (part.type === "tool-call") {
    return {
      ...part,
      ...(part.input ? { input: { ...part.input } } : {}),
    };
  }

  return { ...part };
};

const cloneMessage = (message: ChatMessageV2): ChatMessageV2 => ({
  ...message,
  parts: message.parts.map(clonePart),
});

export function cloneConversationState(
  conversation: ConversationStateV2,
): ConversationStateV2 {
  const mapping: Record<string, ConversationNode> = {};

  for (const [id, node] of Object.entries(conversation.mapping)) {
    mapping[id] = {
      ...node,
      childIds: [...node.childIds],
      message: node.message ? cloneMessage(node.message) : null,
      visible: node.visible !== false,
    };
  }

  return {
    rootId: conversation.rootId,
    cursorId: conversation.cursorId,
    mapping,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const isReachableToRoot = (
  conversation: ConversationStateV2,
  fromId: string,
): boolean => {
  const visited = new Set<string>();
  let cursor: string | null = fromId;

  while (cursor) {
    if (cursor === conversation.rootId) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);

    const node: ConversationNode | undefined = conversation.mapping[cursor];
    if (!node) return false;
    cursor = node.parentId;
  }

  return false;
};

export function assertValidConversationState(
  conversation: ConversationStateV2,
): void {
  assert(conversation.rootId, "conversation.rootId is required");
  assert(conversation.cursorId, "conversation.cursorId is required");
  assert(
    conversation.mapping && typeof conversation.mapping === "object",
    "conversation.mapping is required",
  );

  const rootNode = conversation.mapping[conversation.rootId];
  assert(rootNode, "conversation.rootId must exist in mapping");

  const rootCandidates = Object.values(conversation.mapping).filter(
    (node) => node.role === "root" && node.parentId === null,
  );
  assert(rootCandidates.length === 1, "conversation must contain exactly one root node");
  assert(
    rootCandidates[0].id === conversation.rootId,
    "conversation.rootId must match the root node id",
  );
  assert(rootNode.message === null, "root node message must be null");

  for (const [id, node] of Object.entries(conversation.mapping)) {
    assert(node.id === id, `node id mismatch for mapping key ${id}`);
    assert(Array.isArray(node.childIds), `node ${id} childIds must be an array`);

    if (node.role === "root") {
      assert(node.parentId === null, "root node parentId must be null");
      assert(node.message === null, "root node message must be null");
    } else {
      assert(node.message !== null, `node ${id} message is required`);
      assert(node.message.id === id, `node ${id} message.id must equal node.id`);
      assert(
        node.message.role === node.role,
        `node ${id} message.role must equal node role`,
      );
    }

    if (node.parentId) {
      const parent = conversation.mapping[node.parentId];
      assert(parent, `node ${id} parent ${node.parentId} not found`);
      assert(
        parent.childIds.includes(id),
        `parent ${node.parentId} must include child ${id}`,
      );
    }

    for (const childId of node.childIds) {
      const child = conversation.mapping[childId];
      assert(child, `child ${childId} referenced by ${id} not found`);
      assert(
        child.parentId === id,
        `child ${childId} parent mismatch: expected ${id}, got ${child.parentId}`,
      );
    }
  }

  assert(
    conversation.mapping[conversation.cursorId],
    "conversation.cursorId must exist in mapping",
  );
  assert(
    isReachableToRoot(conversation, conversation.cursorId),
    "conversation.cursorId is not reachable from root",
  );
}

export function initializeConversationState(
  conversation: ConversationStateV2,
): ConversationStateV2 {
  const cloned = cloneConversationState(conversation);
  assertValidConversationState(cloned);
  return cloned;
}

export function getPathNodeIds(
  conversation: ConversationStateV2,
  fromNodeId: string = conversation.cursorId,
): string[] {
  if (!conversation.mapping[fromNodeId]) return [];

  const ids: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null = fromNodeId;

  while (cursor) {
    if (visited.has(cursor)) {
      throw new Error(`cycle detected while resolving path for node ${fromNodeId}`);
    }
    visited.add(cursor);

    const node: ConversationNode | undefined = conversation.mapping[cursor];
    if (!node) {
      throw new Error(`node ${cursor} is missing from mapping`);
    }

    ids.push(node.id);
    cursor = node.parentId;
  }

  return ids.reverse();
}

export function getPathMessages(
  conversation: ConversationStateV2,
  fromNodeId: string = conversation.cursorId,
): ChatMessageV2[] {
  const nodeIds = getPathNodeIds(conversation, fromNodeId);
  const result: ChatMessageV2[] = [];

  for (const id of nodeIds) {
    const node = conversation.mapping[id];
    if (!node || !node.message || !node.visible) continue;
    result.push(cloneMessage(node.message));
  }

  return result;
}

export function getChildrenNodes(
  conversation: ConversationStateV2,
  nodeId: string,
): ConversationNode[] {
  const node = conversation.mapping[nodeId];
  if (!node) return [];

  return node.childIds
    .map((childId) => conversation.mapping[childId])
    .filter((child): child is ConversationNode => Boolean(child));
}

export function getMessageText(message: ChatMessageV2): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function findLatestAssistantNode(
  conversation: ConversationStateV2,
  fromNodeId: string = conversation.cursorId,
): ConversationNode | null {
  const pathIds = getPathNodeIds(conversation, fromNodeId);

  for (let i = pathIds.length - 1; i >= 0; i--) {
    const node = conversation.mapping[pathIds[i]];
    if (node?.role === "assistant") {
      return node;
    }
  }

  return null;
}
