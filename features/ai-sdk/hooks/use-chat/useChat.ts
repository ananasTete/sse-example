import { ChangeEvent, FormEvent, useEffect, useReducer, useRef } from "react";
import { nanoid } from "nanoid";
import {
  Message,
  MessagePart,
  OnFinishCallback,
  OnErrorCallback,
  OnDataCallback,
} from "./types";
import { ChatState, chatReducer } from "./reducer";
import { createSSEParser } from "./parser";

const generateId = () => nanoid();

// ============ Hook Options ============

interface UseChatOptions {
  api: string;
  chatId: string;
  model: string;
  headers?: Record<string, string>;
  trigger?: "submit-message" | "regenerate-message";
  initialMessages?: Message[];
  /** 响应完成后调用，包含响应消息、所有消息以及中止、断开连接和错误的标志 */
  onFinish?: OnFinishCallback;
  /** 发生错误时调用 */
  onError?: OnErrorCallback;
  /** 从服务器接收到数据部分时调用 */
  onData?: OnDataCallback;
}

export function useChat({
  api,
  chatId,
  model,
  headers = {},
  trigger = "submit-message",
  initialMessages = [],
  onFinish,
  onError,
  onData,
}: UseChatOptions) {
  const [state, dispatch] = useReducer(chatReducer, {
    messages: initialMessages,
    input: "",
    status: "ready",
    error: null,
  } as ChatState);

  const { messages, input, status, error } = state;

  // 用于存储最新的 messages，避免回调中的闭包问题
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  // 用于存储 AbortController，以便在 stop 时取消请求
  const abortControllerRef = useRef<AbortController | null>(null);

  // 组件卸载时取消进行中的请求
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    dispatch({ type: "SET_INPUT", payload: e.target.value });
  };

  const setInput = (value: string) => {
    dispatch({ type: "SET_INPUT", payload: value });
  };

  // 停止当前的流式请求
  const stop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      dispatch({ type: "ABORT" });
    }
  };

  /**
   * 核心发送逻辑
   */
  const submitCore = async (
    messageText: string,
    baseMessages: Message[] = messages,
    requestTrigger: "submit-message" | "regenerate-message" = trigger
  ) => {
    if (!messageText.trim()) return;

    // 如果有正在进行的请求，先取消
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // 准备用户消息对象
    const userMessage: Message = {
      id: generateId(),
      chatId,
      role: "user",
      createdAt: new Date().toISOString(),
      parts: [{ type: "text", text: messageText, state: "done" }],
    };

    // 乐观更新：把用户消息显示在界面上
    const newMessages = [...baseMessages, userMessage];
    dispatch({ type: "SUBMIT_MESSAGE", payload: { userMessage, baseMessages } });

    try {
      const response = await fetch(`${api}/${chatId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          id: chatId,
          messages: newMessages,
          model,
          trigger: requestTrigger,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(response.statusText);
      if (!response.body) throw new Error("No response body");

      // 创建 AI 消息占位
      const aiMessageId = generateId();
      const aiMessage: Message = {
        id: aiMessageId,
        chatId,
        role: "assistant",
        createdAt: new Date().toISOString(),
        parts: [],
      };
      dispatch({ type: "ADD_AI_MESSAGE", payload: aiMessage });
      dispatch({ type: "SET_STREAMING" });

      // 创建 SSE 解析器
      const { parser, getServerError, getAiMessageId } = createSSEParser({
        aiMessageId,
        aiMessage,
        dispatch,
        onData,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let isAbort = false;
      let isDisconnect = false;

      while (true) {
        if (abortController.signal.aborted) {
          reader.cancel();
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
          isDisconnect = true;
          console.warn("Connection disconnected:", readError);
          break;
        }
      }

      const finalAiMessageId = getAiMessageId();
      dispatch({ type: "FINALIZE_STREAMING", payload: { messageId: finalAiMessageId } });

      // 使用 queueMicrotask 确保在 state 更新后调用回调
      queueMicrotask(() => {
        const currentMessages = messagesRef.current;
        const finalAiMessage = currentMessages.find((msg) => msg.id === finalAiMessageId) || {
          ...aiMessage,
          id: finalAiMessageId,
          parts: [],
        };

        onFinish?.({
          message: finalAiMessage,
          messages: currentMessages,
          isAbort,
          isDisconnect,
          isError: false,
        });
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted by user");
        dispatch({ type: "SET_READY" });
        return;
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      console.error(err);
      dispatch({ type: "SET_ERROR", payload: errorObj });

      onError?.(errorObj);

      onFinish?.({
        message: {
          id: "",
          chatId,
          role: "assistant",
          createdAt: new Date().toISOString(),
          parts: [{ type: "text", text: "", state: "done" }],
        },
        messages: messagesRef.current,
        isAbort: false,
        isDisconnect: false,
        isError: true,
      });

      return;
    }
    abortControllerRef.current = null;
  };

  /**
   * 表单提交处理（受控模式）
   */
  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const messageText = input;
    dispatch({ type: "SET_INPUT", payload: "" });
    await submitCore(messageText);
  };

  /**
   * 直接发送消息（非受控模式）
   */
  const sendMessage = async (content: string) => {
    await submitCore(content);
  };

  /**
   * 重新生成：找到指定消息，移除它及之后的消息，然后重新请求
   */
  const regenerate = async (options?: {
    userMessageId?: string;
    assistantMessageId?: string;
    newContent?: string;
  }) => {
    const { userMessageId, assistantMessageId, newContent } = options || {};
    let targetUserIndex = -1;

    if (userMessageId) {
      targetUserIndex = messages.findIndex(
        (msg) => msg.id === userMessageId && msg.role === "user"
      );

      if (targetUserIndex === -1) {
        console.warn("User message not found:", userMessageId);
        return;
      }
    } else if (assistantMessageId) {
      const assistantIndex = messages.findIndex(
        (msg) => msg.id === assistantMessageId
      );

      if (assistantIndex === -1) {
        console.warn("Assistant message not found:", assistantMessageId);
        return;
      }

      for (let i = assistantIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          targetUserIndex = i;
          break;
        }
      }
    } else {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          targetUserIndex = i;
          break;
        }
      }
    }

    if (targetUserIndex === -1) {
      console.warn("No user message found to regenerate");
      return;
    }

    const targetUserMessage = messages[targetUserIndex];
    const userText =
      newContent ??
      (targetUserMessage.parts.find((p) => p.type === "text")?.text || "");

    if (!userText.trim()) {
      console.warn("Target user message has no text content");
      return;
    }

    const messagesBeforeTargetUser = messages.slice(0, targetUserIndex);
    await submitCore(userText, messagesBeforeTargetUser, "regenerate-message");
  };

  /**
   * 更新指定消息的 parts
   */
  const updateMessageParts = (
    messageId: string,
    updater: (parts: MessagePart[]) => MessagePart[]
  ) => {
    dispatch({ type: "UPDATE_AI_PARTS", payload: { messageId, updater } });
  };

  return {
    messages,
    input,
    status,
    error,
    isLoading: status === "submitted" || status === "streaming",
    handleInputChange,
    setInput,
    handleSubmit,
    sendMessage,
    regenerate,
    updateMessageParts,
    stop,
  };
}
