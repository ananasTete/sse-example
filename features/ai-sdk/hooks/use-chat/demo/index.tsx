"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Message, MessagePart } from "../types";
import { useChat } from "../useChat";

const DEMO_MODEL = "openai/gpt-5-nano";
const DEMO_API = "/api/agent-editor";

const createDemoChatId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `use-chat-demo-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `use-chat-demo-${Date.now().toString(36)}`;
};

const QUICK_PROMPTS = [
  "你好，先简单介绍一下你能做什么。",
  JSON.stringify(
    {
      context: {
        mode: "selection",
        content: "这个功能写得还行，但我希望表达得更有说服力。",
        selection: {
          from: 0,
          to: 22,
          text: "这个功能写得还行，但我希望表达得更有说服力。",
        },
      },
      userRequest: "请给我 3 个改写方案，风格分别是简洁、正式、生动。",
    },
    null,
    2
  ),
  JSON.stringify(
    {
      context: {
        mode: "fulltext",
        content:
          "我们完成了第一版登录流程，实现了邮箱验证码与密码登录，但缺少错误提示一致性。",
      },
      userRequest: "请指出可以优化的两处并给出修改建议。",
    },
    null,
    2
  ),
];

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
};

const renderPart = (part: MessagePart, index: number) => {
  if (part.type === "step-start") {
    return (
      <div
        key={`step-${index}`}
        className="inline-flex rounded-full border border-stone-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-stone-500"
      >
        step
      </div>
    );
  }

  if (part.type === "reasoning") {
    return (
      <div
        key={`reasoning-${index}`}
        className="rounded-lg border border-amber-200 bg-amber-50/80 p-2 text-xs leading-5 text-amber-900"
      >
        <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-amber-700">
          reasoning {part.state === "streaming" ? "(streaming)" : ""}
        </div>
        <div className="whitespace-pre-wrap">{part.text}</div>
      </div>
    );
  }

  if (part.type === "text") {
    return (
      <div
        key={`text-${index}`}
        className="rounded-lg border border-stone-200 bg-white p-2 text-sm leading-6 text-stone-800"
      >
        <div className="whitespace-pre-wrap">{part.text || "..."}</div>
      </div>
    );
  }

  if (part.type === "tool-call") {
    return (
      <div
        key={`tool-${index}`}
        className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900"
      >
        <div className="font-semibold">
          tool: {part.toolName} ({part.state})
        </div>
        {part.inputText ? (
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-indigo-800">
            {part.inputText}
          </pre>
        ) : null}
        {part.input ? (
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-indigo-800">
            {JSON.stringify(part.input, null, 2)}
          </pre>
        ) : null}
        {part.output ? (
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-indigo-800">
            {JSON.stringify(part.output, null, 2)}
          </pre>
        ) : null}
      </div>
    );
  }

  if (part.type === "image") {
    return (
      <a
        key={`image-${index}`}
        href={part.imageUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-blue-700 underline"
      >
        image: {part.imageUrl}
      </a>
    );
  }

  if (part.type === "source-url") {
    return (
      <a
        key={`source-${index}`}
        href={part.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-blue-700 underline"
      >
        source: {part.title || part.url}
      </a>
    );
  }

  if (part.type === "file") {
    return (
      <a
        key={`file-${index}`}
        href={part.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-blue-700 underline"
      >
        file: {part.filename} ({part.mediaType})
      </a>
    );
  }

  return null;
};

interface UseChatDemoInnerProps {
  onReset: () => void;
}

function UseChatDemoInner({ onReset }: UseChatDemoInnerProps) {
  const chatId = useMemo(() => createDemoChatId(), []);
  const [rawEvents, setRawEvents] = useState<string[]>([]);
  const [finishLogs, setFinishLogs] = useState<string[]>([]);

  const {
    messages,
    input,
    status,
    error,
    isLoading,
    handleInputChange,
    handleSubmit,
    setInput,
    sendMessage,
    regenerate,
    stop,
  } = useChat({
    api: DEMO_API,
    chatId,
    model: DEMO_MODEL,
    onData: (data) => {
      setRawEvents((prev) => [data, ...prev].slice(0, 30));
    },
    onError: (err) => {
      setFinishLogs((prev) => [`error: ${err.message}`, ...prev].slice(0, 10));
    },
    onFinish: ({ isAbort, isDisconnect, isError, message }) => {
      const text = message.parts
        .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("");

      setFinishLogs((prev) => {
        const next = `finish -> abort:${isAbort} disconnect:${isDisconnect} error:${isError} text:${text.slice(
          0,
          60
        )}`;
        return [next, ...prev].slice(0, 10);
      });
    },
  });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    await handleSubmit(e);
  };

  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const latestUser = [...messages].reverse().find((message) => message.role === "user");

  return (
    <section className="w-full max-w-6xl rounded-3xl border border-stone-300 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4 shadow-lg md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-stone-900">
          useChat Hook Demo
        </h2>
        <span className="rounded-full border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600">
          status: {status}
        </span>
        <span className="rounded-full border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600">
          chatId: {chatId}
        </span>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-3">
        {QUICK_PROMPTS.map((prompt, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setInput(prompt)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-left text-xs text-stone-700 transition hover:border-stone-500 hover:bg-stone-50"
          >
            模板 {index + 1}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="mb-4 space-y-3">
        <textarea
          value={input}
          onChange={handleInputChange}
          rows={6}
          placeholder="输入消息并提交，或点击上方模板快速测试..."
          className="w-full resize-y rounded-2xl border border-stone-300 bg-white/95 p-3 text-sm leading-6 text-stone-900 outline-none ring-orange-200 transition focus:ring-2"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "请求中..." : "提交"}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void sendMessage("直接调用 sendMessage 发送的测试消息。")}
            className="rounded-full border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            sendMessage
          </button>
          <button
            type="button"
            disabled={isLoading || !latestUser}
            onClick={() => void regenerate()}
            className="rounded-full border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            regenerate(last)
          </button>
          <button
            type="button"
            disabled={isLoading || !latestAssistant}
            onClick={() => {
              if (!latestAssistant) return;
              void regenerate({ assistantMessageId: latestAssistant.id });
            }}
            className="rounded-full border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            regenerate(by assistantId)
          </button>
          <button
            type="button"
            disabled={!isLoading}
            onClick={stop}
            className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            stop
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700"
          >
            reset session
          </button>
        </div>
      </form>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-stone-300 bg-white/90 p-3">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">
            Messages ({messages.length})
          </div>
          <div className="max-h-[480px] space-y-3 overflow-auto pr-1">
            {messages.length === 0 ? (
              <p className="text-sm text-stone-400">暂无消息，先提交一条试试。</p>
            ) : (
              messages.map((message: Message) => (
                <article
                  key={message.id}
                  className="rounded-xl border border-stone-200 bg-stone-50/70 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <span className="rounded-full border border-stone-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-stone-600">
                      {message.role}
                    </span>
                    <span>{formatTime(message.createdAt)}</span>
                    <span className="truncate">id: {message.id}</span>
                  </div>
                  <div className="space-y-2">
                    {message.parts.map((part, index) => renderPart(part, index))}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-300 bg-white/90 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">
              onFinish / onError
            </div>
            <div className="max-h-52 space-y-2 overflow-auto text-xs text-stone-700">
              {finishLogs.length === 0 ? (
                <p className="text-stone-400">暂无完成回调记录。</p>
              ) : (
                finishLogs.map((log, index) => (
                  <p key={`${log}-${index}`} className="rounded-lg bg-stone-50 p-2">
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-300 bg-white/90 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">
              onData events (latest 30)
            </div>
            <div className="max-h-64 space-y-2 overflow-auto">
              {rawEvents.length === 0 ? (
                <p className="text-xs text-stone-400">暂无流式事件。</p>
              ) : (
                rawEvents.map((event, index) => (
                  <pre
                    key={`${event}-${index}`}
                    className="overflow-x-auto rounded-lg bg-stone-900/95 p-2 text-[11px] leading-5 text-stone-100"
                  >
                    {event}
                  </pre>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function UseChatHookDemo() {
  const [instanceKey, setInstanceKey] = useState(0);

  return (
    <UseChatDemoInner
      key={instanceKey}
      onReset={() => setInstanceKey((value) => value + 1)}
    />
  );
}
