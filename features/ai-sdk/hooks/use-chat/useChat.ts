import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import {
  Message,
  UseChatStatus,
  OnFinishCallback,
  OnErrorCallback,
  OnDataCallback,
} from "./types";

const generateId = () => Math.random().toString(36).substring(2, 15);

interface UseChatOptions {
  api: string;
  chatId: string;
  model: string;
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
  chatId: initialChatId,
  model,
  trigger = "submit-message",
  initialMessages = [],
  onFinish,
  onError,
  onData,
}: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<UseChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);
  const [chatId] = useState(initialChatId);

  // 用于存储 AbortController，以便在 stop 时取消请求
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setInput(e.target.value);
  };

  // 停止当前的流式请求
  const stop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus("ready");
    }
  };

  /**
   * 核心发送逻辑
   * @param messageText 要发送的消息文本
   * @param baseMessages 基础消息列表（用于 regenerate 场景，传入截断后的消息）
   * @param requestTrigger 请求触发类型
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
    setMessages(newMessages);
    setStatus("submitted");
    setError(null);

    try {
      const response = await fetch(`${api}/${chatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      // 创建 AI 消息占位（初始为空 parts 数组）
      let aiMessageId = generateId();
      const aiMessage: Message = {
        id: aiMessageId,
        chatId,
        role: "assistant",
        createdAt: new Date().toISOString(),
        parts: [],
      };
      setMessages((prev) => [...prev, aiMessage]);

      // 处理流式输出
      setStatus("streaming");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // 用于追踪当前的 reasoning 和 text 内容
      let currentReasoningText = "";
      let currentTextContent = "";

      // 辅助函数：更新 AI 消息的 parts
      const updateAiMessageParts = (
        updater: (parts: Message["parts"]) => Message["parts"]
      ) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === aiMessageId) {
              return { ...msg, parts: updater([...msg.parts]) };
            }
            return msg;
          })
        );
      };

      let serverError: Error | null = null;

      const parser = createParser({
        onEvent: (event) => {
          const data = event.data;
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const eventType = parsed.type as string;

            // 调用 onData 回调，传入原始数据
            onData?.(data);

            switch (eventType) {
              case "start":
                // 服务器分配的消息 ID，可选择覆盖本地 ID
                if (parsed.messageId) {
                  aiMessageId = parsed.messageId;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === aiMessage.id
                        ? { ...msg, id: parsed.messageId }
                        : msg
                    )
                  );
                }
                break;

              case "start-step":
                // 步骤开始，可添加 step-start part
                updateAiMessageParts((parts) => [
                  ...parts,
                  { type: "step-start" },
                ]);
                break;

              case "reasoning-start":
                currentReasoningText = "";
                updateAiMessageParts((parts) => [
                  ...parts,
                  { type: "reasoning", text: "", state: "streaming" },
                ]);
                break;

              case "reasoning-delta":
                if (parsed.delta) {
                  currentReasoningText += parsed.delta;
                  updateAiMessageParts((parts) => {
                    // 找到最后一个 reasoning part 并更新
                    const lastReasoningIndex = parts.findLastIndex(
                      (p) => p.type === "reasoning"
                    );
                    if (lastReasoningIndex !== -1) {
                      parts[lastReasoningIndex] = {
                        type: "reasoning",
                        text: currentReasoningText,
                        state: "streaming",
                      };
                    }
                    return parts;
                  });
                }
                break;

              case "reasoning-end":
                updateAiMessageParts((parts) => {
                  const lastReasoningIndex = parts.findLastIndex(
                    (p) => p.type === "reasoning"
                  );
                  if (lastReasoningIndex !== -1) {
                    parts[lastReasoningIndex] = {
                      type: "reasoning",
                      text: currentReasoningText,
                      state: "done",
                    };
                  }
                  return parts;
                });
                break;

              case "text-start":
                currentTextContent = "";
                updateAiMessageParts((parts) => [
                  ...parts,
                  { type: "text", text: "", state: "streaming" },
                ]);
                break;

              case "text-delta":
                if (parsed.delta) {
                  currentTextContent += parsed.delta;
                  updateAiMessageParts((parts) => {
                    // 找到最后一个 text part 并更新
                    const lastTextIndex = parts.findLastIndex(
                      (p) => p.type === "text"
                    );
                    if (lastTextIndex !== -1) {
                      parts[lastTextIndex] = {
                        type: "text",
                        text: currentTextContent,
                        state: "streaming",
                      };
                    }
                    return parts;
                  });
                }
                break;

              case "text-end":
                updateAiMessageParts((parts) => {
                  const lastTextIndex = parts.findLastIndex(
                    (p) => p.type === "text"
                  );
                  if (lastTextIndex !== -1) {
                    parts[lastTextIndex] = {
                      type: "text",
                      text: currentTextContent,
                      state: "done",
                    };
                  }
                  return parts;
                });
                break;

              case "finish-step":
                // 步骤结束，当前暂不做特殊处理
                break;

              case "finish":
                // 完成，可记录 finishReason
                if (parsed.finishReason === "error") {
                  serverError = new Error(
                    parsed.error?.message || "Stream finished with error"
                  );
                }
                break;

              // === 工具调用事件 ===
              case "tool-input-start":
                // 工具调用开始，创建新的 tool-call part
                updateAiMessageParts((parts) => [
                  ...parts,
                  {
                    type: "tool-call",
                    toolCallId: parsed.toolCallId,
                    toolName: parsed.toolName,
                    state: "streaming-input",
                    inputText: "",
                  },
                ]);
                break;

              case "tool-input-delta":
                // 工具参数增量更新
                updateAiMessageParts((parts) => {
                  const toolCallIndex = parts.findLastIndex(
                    (p) =>
                      p.type === "tool-call" &&
                      p.toolCallId === parsed.toolCallId
                  );
                  if (toolCallIndex !== -1) {
                    const toolPart = parts[toolCallIndex];
                    if (toolPart.type === "tool-call") {
                      parts[toolCallIndex] = {
                        ...toolPart,
                        inputText:
                          (toolPart.inputText || "") + parsed.inputTextDelta,
                      };
                    }
                  }
                  return parts;
                });
                break;

              case "tool-input-available":
                // 工具参数完整可用，开始执行
                updateAiMessageParts((parts) => {
                  const toolCallIndex = parts.findLastIndex(
                    (p) =>
                      p.type === "tool-call" &&
                      p.toolCallId === parsed.toolCallId
                  );
                  if (toolCallIndex !== -1) {
                    const toolPart = parts[toolCallIndex];
                    if (toolPart.type === "tool-call") {
                      parts[toolCallIndex] = {
                        ...toolPart,
                        state: "input-available",
                        input: parsed.input,
                      };
                    }
                  }
                  return parts;
                });
                break;

              case "tool-output-available":
                // 工具执行结果可用
                updateAiMessageParts((parts) => {
                  const toolCallIndex = parts.findLastIndex(
                    (p) =>
                      p.type === "tool-call" &&
                      p.toolCallId === parsed.toolCallId
                  );
                  if (toolCallIndex !== -1) {
                    const toolPart = parts[toolCallIndex];
                    if (toolPart.type === "tool-call") {
                      parts[toolCallIndex] = {
                        ...toolPart,
                        state: "output-available",
                        output: parsed.output,
                      };
                    }
                  }
                  return parts;
                });
                break;

              default:
                // 未知事件类型，忽略
                break;
            }
          } catch {
            // 解析失败时忽略（可能是非 JSON 数据）
          }
        },
      });

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
          if (serverError) throw serverError;
        } catch (readError) {
          isDisconnect = true;
          console.warn("Connection disconnected:", readError);
          break;
        }
      }

      // 获取最终的 AI 消息（从当前消息状态中获取最新的 parts）
      let finalAiMessage: Message = aiMessage;
      setMessages((currentMessages) => {
        const currentAiMessage = currentMessages.find(
          (msg) => msg.id === aiMessageId
        );
        if (currentAiMessage) {
          // 将所有 streaming 状态的 parts 标记为 done
          const finalParts = currentAiMessage.parts.map((part) => {
            if (
              (part.type === "text" || part.type === "reasoning") &&
              part.state === "streaming"
            ) {
              return { ...part, state: "done" as const };
            }
            return part;
          });
          finalAiMessage = { ...currentAiMessage, parts: finalParts };
        }
        return currentMessages;
      });

      // 调用 onFinish 回调
      setMessages((currentMessages) => {
        onFinish?.({
          message: finalAiMessage,
          messages: currentMessages,
          isAbort,
          isDisconnect,
          isError: false,
        });
        return currentMessages;
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Request aborted by user");
        setStatus("ready");
        return;
      }
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      console.error(error);
      setStatus("error");
      setError(errorObj);

      onError?.(errorObj);

      setMessages((currentMessages) => {
        onFinish?.({
          message: {
            id: "",
            chatId,
            role: "assistant",
            createdAt: new Date().toISOString(),
            parts: [{ type: "text", text: "", state: "done" }],
          },
          messages: currentMessages,
          isAbort: false,
          isDisconnect: false,
          isError: true,
        });
        return currentMessages;
      });

      return;
    }
    abortControllerRef.current = null;
    setStatus("ready");
  };

  /**
   * 表单提交处理（受控模式）
   * 使用内置的 input 状态，提交后自动清空输入框
   */
  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const messageText = input;
    setInput(""); // 清空输入框
    await submitCore(messageText);
  };

  /**
   * 直接发送消息（非受控模式）
   * 接受提示词参数，不依赖内置的 input 状态
   * 适用于程序化发送、预设按钮、外部状态管理等场景
   */
  const sendMessage = async (content: string) => {
    await submitCore(content);
  };

  /**
   * 重新生成：找到指定消息，移除它及之后的消息，然后重新请求
   * @param options.userMessageId 直接指定 user 消息 ID
   * @param options.assistantMessageId 指定 assistant 消息 ID，会向上查找对应的 user 消息
   * @param options.newContent 可选，替换原 user 消息内容（用于编辑后重新生成）
   */
  const regenerate = async (options?: {
    userMessageId?: string;
    assistantMessageId?: string;
    newContent?: string;
  }) => {
    const { userMessageId, assistantMessageId, newContent } = options || {};
    let targetUserIndex = -1;

    if (userMessageId) {
      // 直接通过 userMessageId 查找
      targetUserIndex = messages.findIndex(
        (msg) => msg.id === userMessageId && msg.role === "user"
      );

      if (targetUserIndex === -1) {
        console.warn("User message not found:", userMessageId);
        return;
      }
    } else if (assistantMessageId) {
      // 通过 assistantMessageId 向上查找 user 消息
      const assistantIndex = messages.findIndex(
        (msg) => msg.id === assistantMessageId
      );

      if (assistantIndex === -1) {
        console.warn("Assistant message not found:", assistantMessageId);
        return;
      }

      // 从该 assistant 消息向上查找最近的 user 消息
      for (let i = assistantIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          targetUserIndex = i;
          break;
        }
      }
    } else {
      // 未指定任何 ID，使用默认逻辑：找最后一条 user 消息
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
    // 如果提供了 newContent，使用新内容；否则使用原消息内容
    const userText =
      newContent ??
      (targetUserMessage.parts.find((p) => p.type === "text")?.text || "");

    if (!userText.trim()) {
      console.warn("Target user message has no text content");
      return;
    }

    // 移除目标 user 消息及其之后的所有消息
    const messagesBeforeTargetUser = messages.slice(0, targetUserIndex);

    // 使用核心逻辑发送，传入截断后的消息列表
    await submitCore(userText, messagesBeforeTargetUser, "regenerate-message");
  };

  return {
    messages,
    input,
    status,
    error,
    isLoading: status === "submitted" || status === "streaming",
    handleInputChange,
    handleSubmit,
    sendMessage, // 新增：非受控模式发送
    regenerate,
    stop,
  };
}

/**
 * 将 input 状态内置，外部以受控方式访问，可以实现在发送后自动清除输入框内容
 *
 * sendMessage: 非受控模式，直接传入消息内容发送，适用于：
 * - 程序化发送消息（如预设按钮）
 * - 外部状态管理（调用方自己管理输入框）
 * - 与其他组件集成（如语音识别、文件解析后发送）
 */
