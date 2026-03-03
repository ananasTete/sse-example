# useChatV2

`useChatV2` is an independent chat hook built with a graph conversation model.

## Key differences from `useChat`

1. Conversation state is a `mapping` graph (`parentId` / `childIds`) instead of a linear `messages[]`.
2. Every request sends only the current user message and a `parentId`.
3. Regenerate creates assistant variants under the same user node.

## Data model

```ts
interface ConversationStateV2 {
  rootId: string;
  cursorId: string;
  mapping: Record<string, ConversationNode>;
}

interface ConversationNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  role: "root" | "system" | "user" | "assistant";
  message: ChatMessageV2 | null;
  visible: boolean;
}
```

`activeMessages` is derived from the current branch path (`cursorId -> root`), filtering out nodes with `visible === false` and nodes without message content.

## Request payload

```json
{
  "model": "openai/gpt-5-nano",
  "trigger": "submit-message",
  "parentId": "node-id",
  "message": {
    "id": "message-id",
    "role": "user",
    "createdAt": "2026-01-11T10:00:00.000Z",
    "parts": [{ "type": "text", "text": "hello", "state": "done" }]
  }
}
```

## SSE handling

The parser supports the same event family as `useChat`:

- `start`
- `start-step`
- `reasoning-start` / `reasoning-delta` / `reasoning-end`
- `tool-input-start` / `tool-input-delta` / `tool-input-available`
- `tool-output-available`
- `text-start` / `text-delta` / `text-end`
- `finish-step`
- `finish`
- `[DONE]`

When the server sends `start.messageId`, the assistant placeholder node id is renamed in the mapping to keep local state aligned with server identifiers.

## Exposed branch helpers

- `setCursor(nodeId)`
- `getPathMessages(nodeId)`
- `getChildren(nodeId)`

These APIs allow branch switching while preserving the full graph.
