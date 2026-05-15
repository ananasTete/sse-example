"use client";

import { X } from "lucide-react";
import {
  useEditorAgentSelection,
  useEditorAgentActions,
} from "../context/editor-agent-context";

export function ContextBar() {
  const selectionInfo = useEditorAgentSelection();
  const { clearSelection } = useEditorAgentActions();

  if (!selectionInfo) return null;

  return (
    <div className="flex items-center px-3 pb-2">
      <span className="inline-flex max-w-64 items-center gap-1.5 rounded-full border border-[#e1d7c9] bg-[#f5f0ea] px-2.5 py-1 text-xs text-[#4b4639]">
        <span className="truncate">{selectionInfo.text}</span>
        <button
          type="button"
          onClick={clearSelection}
          className="flex-none rounded-full p-0.5 text-[#8d7f73] hover:bg-[#e6ddd1] hover:text-[#4b4639] transition-colors"
          aria-label="取消选区"
        >
          <X className="size-3" />
        </button>
      </span>
    </div>
  );
}
