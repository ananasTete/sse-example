import { ChevronDown } from "lucide-react";

interface ChatConversationHeaderProps {
  selectedModel: string;
  isLoading: boolean;
  onModelChange: (model: string) => void;
}

const MODEL_OPTIONS = [
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { value: "gpt-4", label: "GPT-4" },
  { value: "claude-3-opus", label: "Claude 3 Opus" },
];

export function ChatConversationHeader({
  selectedModel,
  isLoading,
  onModelChange,
}: ChatConversationHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-start bg-[#f9f8f6]/80 p-4 backdrop-blur-md">
      <div className="group relative">
        <div className="flex cursor-pointer items-center gap-2 rounded-full bg-[#ebe6e0]/50 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-[#ebe6e0]">
          <span>{selectedModel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </div>
        <select
          value={selectedModel}
          onChange={(event) => onModelChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={isLoading}
        >
          {MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
