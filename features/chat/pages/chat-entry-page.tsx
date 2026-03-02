import { useCallback, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SendHorizontal } from "lucide-react";
import { nanoid } from "nanoid";
import type { ChatNavigationState } from "@/features/chat/services/chat-navigation-state";

export function ChatEntryPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");

  const submitPrompt = useCallback(() => {
    const text = prompt.trim();
    if (!text) return;

    const chatId = nanoid();
    const state: ChatNavigationState = {
      bootstrapPrompt: {
        token: nanoid(),
        text,
      },
    };

    void navigate({
      to: "/chat/$chatId",
      params: { chatId },
      state,
    });
  }, [navigate, prompt]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      submitPrompt();
    },
    [submitPrompt],
  );

  return (
    <div className="h-full min-h-0 bg-[#f9f8f6] text-slate-800">
      <div className="mx-auto flex h-full max-w-4xl items-center px-6 py-12">
        <div className="w-full space-y-5">
          <p className="text-center font-bold text-3xl">今天想做点什么？</p>
          <div className="rounded-[26px] border border-stone-200 bg-white shadow-xl shadow-stone-200/50 transition-shadow">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message..."
              className="scrollbar-hide max-h-[220px] min-h-28 w-full resize-none rounded-t-[26px] border-none bg-transparent px-5 pb-3 pt-4 leading-relaxed text-stone-800 placeholder:text-stone-400 focus-visible:outline-none"
              rows={1}
            />
            <div className="flex items-center justify-end px-3 pb-3 pt-2.5">
              <button
                type="button"
                onClick={submitPrompt}
                disabled={!prompt.trim()}
                className="rounded-full bg-stone-900 p-2 text-white transition-colors disabled:bg-stone-200 disabled:text-stone-400"
                aria-label="发送首条消息"
              >
                <SendHorizontal className="h-5 w-5" />
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] font-medium text-stone-400">
            AI can make mistakes. Please double-check responses.
          </p>
        </div>
      </div>
    </div>
  );
}
