import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { SendHorizontal, StopCircle } from "lucide-react";

interface ChatConversationInputProps {
  input: string;
  isHeroMode: boolean;
  isLoading: boolean;
  error: Error | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatConversationInput({
  input,
  isHeroMode,
  isLoading,
  error,
  textareaRef,
  onInputChange,
  onKeyDown,
  onSubmit,
  onStop,
}: ChatConversationInputProps) {
  return (
    <div
      className={`px-4 transition-[padding,background] duration-300 ease-out ${
        isHeroMode
          ? "bg-transparent py-4"
          : "bg-gradient-to-t from-[#f9f8f6] via-[#f9f8f6] to-transparent pb-8 pt-4"
      }`}
    >
      <div
        className={`relative mx-auto max-w-3xl transition-transform duration-300 ease-out ${
          isHeroMode ? "-translate-y-2" : "translate-y-0"
        }`}
      >
        {error ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 absolute -top-14 left-0 right-0 mx-auto flex w-max max-w-full items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600 shadow-sm">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
            {error.message}
          </div>
        ) : null}

        <div className="relative flex items-end rounded-[26px] border border-stone-200 bg-white shadow-xl shadow-stone-200/50 transition-shadow focus-within:ring-2 focus-within:ring-stone-200/50">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder="Message..."
            className="scrollbar-hide max-h-[200px] w-full resize-none rounded-[26px] border-none bg-transparent py-4 pl-5 pr-14 leading-relaxed text-stone-800 placeholder:text-stone-400 focus:ring-0"
            rows={1}
            disabled={isLoading}
          />
          <div className="absolute bottom-2 right-2">
            {isLoading ? (
              <button
                onClick={onStop}
                className="rounded-full bg-stone-900 p-2 text-white transition-opacity hover:opacity-90"
              >
                <StopCircle className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!input.trim()}
                className="rounded-full bg-stone-900 p-2 text-white transition-colors disabled:bg-stone-200 disabled:text-stone-400"
              >
                <SendHorizontal className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2.5 text-center">
          <p className="text-[11px] font-medium text-stone-400">
            AI can make mistakes. Please double-check responses.
          </p>
        </div>
      </div>
    </div>
  );
}
