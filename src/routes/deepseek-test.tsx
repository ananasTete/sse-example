import { FormEvent, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/deepseek-test")({
  component: DeepSeekTestPage,
});

function DeepSeekTestPage() {
  const didCreateSessionRef = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  useEffect(() => {
    if (didCreateSessionRef.current) return;
    didCreateSessionRef.current = true;

    void fetch("/api/v0/chat_session/create", {
      method: "POST",
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || status === "sending") return;

    setStatus("sending");

    try {
      const response = await fetch("/api/chat/completion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      await response.text();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-2xl gap-3"
      >
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="输入测试 prompt"
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || status === "sending"}
          className="rounded bg-gray-900 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {status === "sending" ? "提交中" : "提交"}
        </button>
      </form>
      <div className="mx-auto mt-3 w-full max-w-2xl text-sm text-gray-600">
        Status: {status}
      </div>
    </main>
  );
}
