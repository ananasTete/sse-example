import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Send,
  StopCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Bot,
  User,
  Sparkles,
  Wrench,
  CheckCircle2,
  Activity,
  Cpu,
} from "lucide-react";
import { useAdvancedChat } from "../../hooks/use-advanced-chat";
import type {
  ChatTree,
  ChatNode,
  MessagePart,
} from "../../types/chat-advanced";

export const Route = createFileRoute("/advanced-chat/$chatId")({
  component: AdvancedChatStandalone,
});

function AdvancedChatStandalone() {
  const { chatId } = Route.useParams();
  const [initialTree, setInitialTree] = useState<ChatTree | null>(null);

  useEffect(() => {
    fetch(`/api/advanced-chat/${chatId}`)
      .then((res) => res.json())
      .then((data) => setInitialTree(data))
      .catch(console.error);
  }, [chatId]);

  if (!initialTree) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 font-sans text-zinc-400">
        <div className="flex flex-col items-center gap-4">
          <Cpu className="h-8 w-8 animate-pulse text-indigo-500" />
          <p>Initializing Advanced Stream Engine...</p>
        </div>
      </div>
    );
  }

  return <ChatUI chatId={chatId} initialTree={initialTree} />;
}

function ChatUI({
  chatId,
  initialTree,
}: {
  chatId: string;
  initialTree: ChatTree;
}) {
  const {
    activeThread,
    append,
    reload,
    switchBranch,
    abort,
    isStreaming,
    messageLimit,
    tree,
  } = useAdvancedChat(chatId, initialTree);

  const [inputMessage, setInputMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeThread]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isStreaming) return;
    append(inputMessage);
    setInputMessage("");
  };

  return (
    <div className="flex h-screen w-full bg-[#f9f8f6] text-slate-800 font-sans selection:bg-slate-200">
      <div className="flex w-full max-w-5xl mx-auto h-full flex-col relative bg-white shadow-2xl overflow-hidden sm:rounded-3xl sm:my-4 ring-1 ring-slate-200">
        {/* Header Suite */}
        <header className="flex flex-col border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
                  Advanced Stream Protocol
                </h1>
                <p className="text-xs font-medium text-slate-500">
                  {chatId.slice(0, 12)}...
                </p>
              </div>
            </div>

            {/* Out-of-band Message Limit Indicator */}
            {messageLimit && (
              <div className="flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm animate-in fade-in zoom-in-95">
                <Activity className="h-3 w-3" />
                Remaining Tokens: {messageLimit.remaining}
                <span className="opacity-50">|</span>
                {Math.round(messageLimit.utilization * 100)}% Used
              </div>
            )}
          </div>
        </header>

        {/* Chat Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 space-y-10 scroll-smooth bg-slate-50/50"
        >
          {activeThread.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6">
              <div className="h-20 w-20 rounded-3xl bg-white shadow-xl ring-1 ring-slate-100 flex items-center justify-center rotate-12 transition-transform hover:rotate-0 duration-500">
                <Sparkles className="h-10 w-10 text-indigo-400" />
              </div>
              <p className="max-w-sm text-center text-sm leading-relaxed">
                Connect deeply with the AI. <br />
                Experience multi-modal structured streams, including{" "}
                <strong>Reasoning</strong>, <strong>Tools</strong>, and{" "}
                <strong>Texts</strong> in real-time.
              </p>
            </div>
          )}

          {activeThread.map((node) => (
            <MessageRow
              key={node.id}
              node={node}
              tree={tree}
              onSwitchBranch={switchBranch}
              onReload={reload}
              isStreaming={isStreaming && node.id === tree.currentLeafId}
            />
          ))}
        </div>

        {/* Composer */}
        <div className="p-4 bg-white border-t border-slate-100 z-10 w-full shrink-0">
          <form
            onSubmit={handleSend}
            className="flex items-end gap-3 mx-auto max-w-4xl"
          >
            <div className="relative flex-1 bg-slate-50 rounded-2xl ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-500 transition-shadow">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask anything..."
                className="w-full bg-transparent resize-none outline-none max-h-48 text-slate-800 placeholder-slate-400 px-5 py-4 min-h-[56px] rounded-2xl"
                rows={1}
                disabled={isStreaming}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={abort}
                className="flex shrink-0 h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors shadow-sm"
              >
                <StopCircle className="h-6 w-6" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="flex shrink-0 h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-200"
              >
                <Send className="h-5 w-5 ml-1" />
              </button>
            )}
          </form>
          <div className="text-center mt-3 text-[10px] text-slate-400 font-medium tracking-wide">
            POWERED BY DEEPSEEK R1 ADVANCED ARCHITECTURE
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  node,
  tree,
  onSwitchBranch,
  onReload,
  isStreaming,
}: {
  node: ChatNode;
  tree: ChatTree;
  onSwitchBranch: (id: string) => void;
  onReload: () => void;
  isStreaming: boolean;
}) {
  if (!node.message) return null;

  const isUser = node.role === "user";
  const parentNode = node.parentId ? tree.mapping[node.parentId] : null;

  let switcher = null;
  if (parentNode && parentNode.childIds.length > 1) {
    const total = parentNode.childIds.length;
    const currentIndex = parentNode.childIds.indexOf(node.id);
    switcher = (
      <div className="flex items-center space-x-1 text-xs text-slate-400 font-semibold bg-white ring-1 ring-slate-200 rounded-lg px-1 py-0.5 shadow-sm">
        <button
          onClick={() => {
            const prevIndex = (currentIndex - 1 + total) % total;
            onSwitchBranch(parentNode.childIds[prevIndex]);
          }}
          className="p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-30"
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="px-1 tabular-nums">
          {currentIndex + 1} / {total}
        </span>
        <button
          onClick={() => {
            const nextIndex = (currentIndex + 1) % total;
            onSwitchBranch(parentNode.childIds[nextIndex]);
          }}
          className="p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-30"
          disabled={currentIndex === total - 1}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}
    >
      <div
        className={`flex flex-col gap-2 max-w-[90%] md:max-w-[80%] min-w-0 ${isUser ? "items-end" : "items-start"}`}
      >
        {/* Avatar & Meta Row */}
        <div
          className={`flex items-center gap-3 px-1 text-slate-500 mb-1 ${isUser ? "flex-row-reverse" : "flex-row"}`}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-white shadow-sm ${isUser ? "bg-slate-800" : "bg-indigo-600"}`}
          >
            {isUser ? (
              <User className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-700">
            {isUser ? "You" : "Assistant"}
          </span>
          {switcher}
        </div>

        {/* Bubble */}
        <div
          className={`relative p-5 shadow-sm ring-1 ring-slate-900/5 ${isUser ? "bg-white rounded-3xl rounded-tr-sm" : "bg-white rounded-3xl rounded-tl-sm w-full"}`}
        >
          <MessageContent parts={node.message.parts} />

          {node.message.status === "error" && (
            <div className="mt-4 text-sm font-medium text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
              <StopCircle className="h-4 w-4" />
              Stream was unexpectedly aborted.
            </div>
          )}
        </div>

        {/* Actions Row */}
        {!isUser && !isStreaming && node.message.status !== "error" && (
          <div className="px-2 mt-1">
            <button
              onClick={onReload}
              className="text-xs font-semibold text-slate-400 hover:text-indigo-600 flex items-center gap-1.5 transition-colors bg-white hover:bg-indigo-50 px-3 py-1.5 rounded-full ring-1 ring-slate-200 hover:ring-indigo-200 shadow-sm"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate Pattern
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ parts }: { parts: MessagePart[] }) {
  if (parts.length === 0) {
    return (
      <div className="text-indigo-500 font-medium text-sm flex items-center gap-2">
        <Sparkles className="h-4 w-4 animate-pulse" />
        Processing Stream...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {parts.map((p, i) => {
        if (!p) return null;

        // --- Reasoning Block ---
        if (p.type === "reasoning") {
          return (
            <details
              key={i}
              className="group overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/50 open:bg-amber-50 transition-colors shadow-sm"
            >
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-amber-700 hover:text-amber-800 list-none select-none">
                <Sparkles className="h-4 w-4" />
                <span>Internal Thought Process</span>
                {p.state === "streaming" && (
                  <span className="flex items-center gap-1 ml-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                )}
                <div className="ml-auto text-xs font-normal opacity-60">
                  Expand to view
                </div>
              </summary>
              <div className="border-t border-amber-200/50 px-4 py-3 text-sm text-slate-600 font-mono leading-relaxed whitespace-pre-wrap">
                {p.text}
              </div>
            </details>
          );
        }

        // --- Tool Use Block ---
        if (p.type === "tool_use") {
          return (
            <div
              key={i}
              className="rounded-2xl border border-blue-200 bg-blue-50/30 overflow-hidden shadow-sm"
            >
              <div className="flex items-center gap-2 bg-blue-50/80 px-4 py-3 border-b border-blue-100">
                <Wrench className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-bold text-blue-900">
                  Calling Tool: {p.tool_name}
                </span>
                {p.state === "streaming" && (
                  <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded shadow-sm animate-pulse">
                    STREAMING ARGS...
                  </span>
                )}
              </div>
              <div className="p-4 bg-[#0d1117] text-[#c9d1d9] font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed relative">
                {p.input_json || "Waiting for arguments..."}
              </div>
            </div>
          );
        }

        // --- Tool Result Block ---
        if (p.type === "tool_result") {
          return (
            <div
              key={i}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 pointer-events-none shadow-sm flex items-start gap-4 p-4"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-emerald-900 mb-1">
                  Tool Execution Successful
                </div>
                <pre className="text-xs text-emerald-800 font-mono w-full overflow-x-hidden text-ellipsis whitespace-pre-wrap">
                  {JSON.stringify(p.content, null, 2)}
                </pre>
              </div>
            </div>
          );
        }

        // --- Text Block ---
        if (p.type === "text") {
          return (
            <div
              key={i}
              className="prose prose-slate max-w-none text-[15px] leading-relaxed relative"
            >
              {p.text}
              {p.state === "streaming" && (
                <span className="inline-block h-4 w-1.5 ml-1 bg-indigo-500 align-middle animate-pulse duration-75" />
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
