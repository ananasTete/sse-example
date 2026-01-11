export type PartState = "streaming" | "done";

export type MessagePart =
  | { type: "step-start" }
  | { type: "reasoning"; text: string; state: PartState }
  | { type: "text"; text: string; state: PartState }
  | { type: "image"; imageUrl: string };

export interface Message {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt: string; // 统一用 ISO String，方便前后端传输
  chatId?: string;
}

export const getMessageText = (message: Message) => {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
};

/**
 * Chat 状态类型
 * - submitted: 消息已发送到 API，正在等待响应流开始
 * - streaming: 响应正在从 API 流式传入，接收数据块
 * - ready: 完整响应已接收并处理完成，可以提交新的用户消息
 * - error: API 请求期间发生错误，阻止成功完成
 */
export type UseChatStatus = "submitted" | "streaming" | "ready" | "error";

/**
 * onFinish 回调参数
 */
export interface OnFinishParams {
  /** 最终的 AI 响应消息 */
  message: Message;
  /** 完成时的所有消息列表 */
  messages: Message[];
  /** 是否被用户主动中止 */
  isAbort: boolean;
  /** 是否因连接断开而结束 */
  isDisconnect: boolean;
  /** 是否因错误而结束 */
  isError: boolean;
}

/**
 * onFinish 回调类型
 * 响应完成后调用，包含响应消息、所有消息以及中止、断开连接和错误的标志
 */
export type OnFinishCallback = (params: OnFinishParams) => void;

/**
 * onError 回调类型
 * 发生错误时调用
 */
export type OnErrorCallback = (error: Error) => void;

/**
 * onData 回调类型
 * 从服务器接收到数据部分时调用
 */
export type OnDataCallback = (data: string) => void;
