import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAdvancedChat } from "@/src/hooks/use-advanced-chat";
import type { ChatTree } from "@/src/types/chat-advanced";
import { Sparkles, Wrench, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/chat/advanced/")({
  component: AdvancedChatDemo,
});

function AdvancedChatDemo() {
  const [initTree, setInitTree] = useState<ChatTree | null>(null);

  // 1. 初始化拉取一棵 ChatTree
  useEffect(() => {
    fetch("/api/advanced-chat/demo-chat-id")
      .then((res) => {
        if (!res.ok) throw new Error("Need to create a chat ID first!");
        return res.json();
      })
      .then((data) => setInitTree(data))
      .catch(() => {
        // Mock a default root if no backend
        const dummyId = "chat-root:demo-chat-id";
        setInitTree({
          rootId: dummyId,
          currentLeafId: dummyId,
          mapping: {
            [dummyId]: {
              id: dummyId,
              parentId: null,
              childIds: [],
              role: "root",
              message: null,
            },
          },
        });
      });
  }, []);

  if (!initTree) return <div>Loading Advanced Engine...</div>;
  return <AdvancedChatUI initialTree={initTree} />;
}

// 核心测试容器：专门验证我们刚才写的 `content_block_start/delta/stop` 树渲染
function AdvancedChatUI({ initialTree }: { initialTree: ChatTree }) {
  const [input, setInput] = useState("");
  const { activeThread, append, isStreaming } = useAdvancedChat(
    "demo-chat-id",
    initialTree,
  );

  return (
    <div className="flex h-screen flex-col bg-[#f9f8f6]">
      <div className="flex-1 overflow-auto p-4 max-w-4xl mx-auto w-full space-y-8">
        {activeThread.map((node) => (
          <div
            key={node.id}
            className={`flex ${node.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-4 ${node.role === "user" ? "bg-slate-200" : "bg-white shadow-sm border border-slate-100"}`}
            >
              <div className="text-xs text-slate-400 mb-2">
                {node.role.toUpperCase()}
              </div>

              <div className="space-y-4">
                {node.message?.parts.map((part, index) => {
                  // 2. 根据不同的 Content Block (MessagePart) 精妙渲染卡片！
                  if (part.type === "reasoning") {
                    return (
                      <details
                        key={index}
                        className="group border-l-2 border-amber-300 pl-3"
                      >
                        <summary className="text-xs text-amber-600 font-medium flex items-center gap-2 cursor-pointer list-none">
                          <Sparkles className="w-3.5 h-3.5" />
                          思考过程{" "}
                          {part.state === "streaming" && (
                            <span className="animate-pulse">...</span>
                          )}
                        </summary>
                        <div className="mt-2 text-sm text-slate-500 whitespace-pre-wrap font-mono">
                          {part.text}
                        </div>
                      </details>
                    );
                  }
                  if (part.type === "tool_use") {
                    return (
                      <div
                        key={index}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center gap-2 font-medium text-slate-700">
                          <Wrench className="w-4 h-4 text-blue-500" />
                          正在使用工具: {part.tool_name}
                        </div>
                        <pre className="mt-2 text-xs bg-slate-800 text-slate-200 p-2 rounded">
                          {part.input_json || "正在流式生成参数..."}
                        </pre>
                      </div>
                    );
                  }
                  if (part.type === "tool_result") {
                    return (
                      <div
                        key={index}
                        className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center gap-2 font-medium text-green-700">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          工具执行结果
                        </div>
                        <pre className="mt-2 text-xs text-green-900 bg-green-100/50 p-2 rounded">
                          {JSON.stringify(part.content, null, 2)}
                        </pre>
                      </div>
                    );
                  }
                  // 普通 Text
                  return (
                    <div
                      key={index}
                      className="text-sm whitespace-pre-wrap leading-relaxed text-slate-800"
                    >
                      {part.text}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-white border-t border-slate-200 max-w-4xl mx-auto w-full pb-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !isStreaming) {
              append(input);
              setInput("");
            }
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
            placeholder="Type your message to test Advanced Stream Protocol..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white disabled:opacity-50 transition-colors"
          >
            {isStreaming ? "Streaming..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
