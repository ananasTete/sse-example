import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  Globe,
  Paperclip,
  Plus,
  SendHorizontal,
  StopCircle,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatConversationInputProps {
  input: string;
  isHeroMode: boolean;
  isLoading: boolean;
  error: Error | null;
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
  onInputChange,
  onKeyDown,
  onSubmit,
  onStop,
}: ChatConversationInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  // 配置自适应高度
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [input]);

  return (
    <div
      className={`px-4 transition-[padding,background] duration-300 ease-out ${
        isHeroMode
          ? "bg-transparent py-4"
          : "bg-gradient-to-t from-[#f9f8f6] via-[#f9f8f6] to-transparent pb-8 pt-4"
      }`}
    >
      <div className="relative mx-auto max-w-3xl">
        {error ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 absolute -top-14 left-0 right-0 mx-auto flex w-max max-w-full items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600 shadow-sm">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
            {error.message}
          </div>
        ) : null}

        <div className="rounded-[26px] border border-stone-200 bg-white shadow-xl shadow-stone-200/50 transition-shadow">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder="Message..."
            className="scrollbar-hide max-h-[200px] w-full resize-none rounded-t-[26px] border-none bg-transparent px-5 pb-3 pt-4 leading-relaxed text-stone-800 placeholder:text-stone-400 focus-visible:outline-none"
            rows={1}
            disabled={isLoading}
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-2.5">
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="打开附件与工具菜单"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className="w-44"
                >
                  <DropdownMenuItem>
                    <Paperclip className="h-4 w-4" />
                    添加照片和文件
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setIsWebSearchEnabled((prev) => !prev);
                    }}
                    className={
                      isWebSearchEnabled
                        ? "text-blue-600 focus:text-blue-600"
                        : "text-stone-700"
                    }
                  >
                    <Globe
                      className={`h-4 w-4 ${
                        isWebSearchEnabled ? "text-blue-600" : "text-stone-500"
                      }`}
                    />
                    <span>网页搜索</span>
                    {isWebSearchEnabled ? (
                      <Check className="ml-auto h-4 w-4 text-blue-600" />
                    ) : null}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {isWebSearchEnabled ? (
                <button
                  type="button"
                  onClick={() => setIsWebSearchEnabled(false)}
                  aria-label="关闭网页搜索"
                  className="group inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                >
                  <span className="relative h-3.5 w-3.5">
                    <Globe className="absolute inset-0 h-3.5 w-3.5 transition-opacity duration-150 group-hover:opacity-0" />
                    <X className="absolute inset-0 h-3.5 w-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                  </span>
                  网页搜索
                </button>
              ) : null}
            </div>

            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="rounded-full bg-stone-900 p-2 text-white transition-opacity hover:opacity-90"
              >
                <StopCircle className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
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
