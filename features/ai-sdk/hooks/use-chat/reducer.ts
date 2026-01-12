import { Message, MessagePart, UseChatStatus } from "./types";

// ============ State & Action Types ============

export interface ChatState {
  messages: Message[];
  input: string;
  status: UseChatStatus;
  error: Error | null;
}

export type ChatAction =
  | { type: "SET_INPUT"; payload: string }
  | { type: "SUBMIT_MESSAGE"; payload: { userMessage: Message; baseMessages: Message[] } }
  | { type: "ADD_AI_MESSAGE"; payload: Message }
  | { type: "SET_STREAMING" }
  | { type: "UPDATE_AI_MESSAGE"; payload: { messageId: string; updates: Partial<Message> } }
  | { type: "UPDATE_AI_PARTS"; payload: { messageId: string; updater: (parts: MessagePart[]) => MessagePart[] } }
  | { type: "FINALIZE_STREAMING"; payload: { messageId: string } }
  | { type: "SET_ERROR"; payload: Error }
  | { type: "SET_READY" }
  | { type: "ABORT" };

// ============ Reducer ============

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, input: action.payload };

    case "SUBMIT_MESSAGE":
      return {
        ...state,
        messages: [...action.payload.baseMessages, action.payload.userMessage],
        status: "submitted",
        error: null,
      };

    case "ADD_AI_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };

    case "SET_STREAMING":
      return { ...state, status: "streaming" };

    case "UPDATE_AI_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.messageId
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      };

    case "UPDATE_AI_PARTS":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.messageId
            ? { ...msg, parts: action.payload.updater([...msg.parts]) }
            : msg
        ),
      };

    case "FINALIZE_STREAMING":
      return {
        ...state,
        status: "ready",
        messages: state.messages.map((msg) =>
          msg.id === action.payload.messageId
            ? {
                ...msg,
                parts: msg.parts.map((part) =>
                  (part.type === "text" || part.type === "reasoning") &&
                  part.state === "streaming"
                    ? { ...part, state: "done" as const }
                    : part
                ),
              }
            : msg
        ),
      };

    case "SET_ERROR":
      return { ...state, status: "error", error: action.payload };

    case "SET_READY":
      return { ...state, status: "ready" };

    case "ABORT":
      return { ...state, status: "ready" };

    default:
      return state;
  }
}
