import { useState } from "react";
import { useChat } from "../useChat";
import { ToolCallRenderer } from "./ToolCallRenderer";

export const ChatExample = () => {
  const { messages, input, handleInputChange, handleSubmit, status, error, isLoading, stop, regenerate } = useChat({ api: '/api/chats', chatId: '123', model: 'gpt-3.5-turbo' });

  // 编辑状态管理
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // 开始编辑
  const handleStartEdit = (messageId: string, currentText: string) => {
    setEditingMessageId(messageId);
    setEditingContent(currentText);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };

  // 提交编辑并重新生成
  const handleSubmitEdit = () => {
    if (!editingMessageId || !editingContent.trim()) return;
    regenerate({ userMessageId: editingMessageId, newContent: editingContent });
    setEditingMessageId(null);
    setEditingContent("");
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* 状态指示器 */}
      <div className="mb-4 text-sm text-gray-500">
        Status: <span className="font-mono font-semibold">{status}</span>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          Error: {error.message}
        </div>
      )}

      <div className="space-y-4 mb-4">
        {messages.map((message) => {
          // 获取消息文本内容（用于编辑）
          const messageText = message.parts.find((p) => p.type === "text")?.text || "";
          const isEditing = editingMessageId === message.id;

          return (
            <div key={message.id} className={`p-3 rounded-lg ${
              message.role === 'user' ? 'bg-blue-100 ml-auto max-w-[80%]' : 'bg-gray-100 mr-auto max-w-[80%]'
            }`}>
              <div className="text-xs text-gray-500 mb-1 font-bold uppercase">
                {message.role}
              </div>
              
              {/* 核心渲染逻辑：遍历 Parts */}
              <div className="space-y-2">
                {/* 编辑模式：显示 textarea */}
                {message.role === 'user' && isEditing ? (
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full p-2 border border-blue-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    autoFocus
                  />
                ) : (
                  // 非编辑模式：正常渲染消息内容
                  message.parts.map((part, index) => {
                    if (part.type === 'step-start') {
                      return null; // step-start 暂不渲染
                    }
                    if (part.type === 'reasoning') {
                      return (
                        <details 
                          key={index} 
                          className="bg-amber-50 border border-amber-200 rounded p-2"
                          open={part.state === 'streaming'}
                        >
                          <summary className="cursor-pointer text-amber-700 text-sm font-medium flex items-center gap-2">
                            <span>💭 思考过程</span>
                            {part.state === 'streaming' && (
                              <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                            )}
                          </summary>
                          <div className="mt-2 text-sm text-amber-800 whitespace-pre-wrap">
                            {part.text}
                          </div>
                        </details>
                      );
                    }
                    if (part.type === 'text') {
                      return (
                        <div key={index} className="whitespace-pre-wrap">
                          {part.text}
                          {part.state === 'streaming' && (
                            <span className="inline-block w-1.5 h-4 bg-gray-500 ml-0.5 animate-pulse" />
                          )}
                        </div>
                      );
                    }
                    if (part.type === 'image') {
                      return <img src={part.imageUrl} key={index} alt="AI generated" className="max-w-full rounded" />;
                    }
                    if (part.type === 'tool-call') {
                      return <ToolCallRenderer key={index} part={part} />;
                    }
                    return null;
                  })
                )}
              </div>
              
              {/* User 消息：编辑按钮 或 取消/提交按钮 */}
              {message.role === 'user' && (
                <div className="mt-2 flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-300 rounded"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitEdit}
                        className="text-xs text-white bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded"
                      >
                        提交
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(message.id, messageText)}
                      disabled={isLoading}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      编辑
                    </button>
                  )}
                </div>
              )}

              {/* 重新生成按钮：仅在 assistant 消息且非加载状态时显示 */}
              {message.role === 'assistant' && !isLoading && (
                <button
                  type="button"
                  onClick={() => regenerate({ assistantMessageId: message.id })}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  重新生成
                </button>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Say something..."
          className="flex-1 border border-gray-300 rounded px-3 py-2"
          disabled={isLoading}
        />
        {isLoading ? (
          <button 
            type="button"
            onClick={stop}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Stop
          </button>
        ) : (
          <button 
            type="submit" 
            className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
};