"use client";

import { useCallback } from "react";
import type { SelectionInfo, QuickAction } from "../types";
import { QUICK_ACTIONS } from "../types";

interface ContextBarProps {
  selectionInfo: SelectionInfo | null;
  onQuickAction: (action: QuickAction, prompt: string) => void;
  onClear: () => void;
}

export function ContextBar({
  selectionInfo,
  onQuickAction,
  onClear,
}: ContextBarProps) {
  const handleQuickAction = useCallback(
    (action: (typeof QUICK_ACTIONS)[number]) => {
      onQuickAction(action.key, action.prompt);
    },
    [onQuickAction]
  );

  if (!selectionInfo) return null;

  // 截断显示文本（超过 20 字则截断）
  const displayText =
    selectionInfo.text.length > 20
      ? selectionInfo.text.slice(0, 20) + "..."
      : selectionInfo.text;

  return (
    <div className="border-b border-[#e6ddd1] p-3 bg-[#faf7f3]">
      {/* 选中内容提示 */}
      <div className="text-sm text-[#6f6258] mb-2">
        正在讨论：
        <span className="ml-1 inline-flex items-center rounded-md border border-[#e1d7c9] bg-white/80 px-2 py-0.5 text-[#2f2a24] font-medium">
          &quot;{displayText}&quot;
        </span>
      </div>

      {/* 快捷操作按钮 */}
      <div className="flex items-center gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => handleQuickAction(action)}
            className="px-3 py-1 text-xs font-medium bg-white/90 border border-[#e1d7c9] rounded-md text-[#2f2a24] shadow-[0_1px_0_rgba(63,53,45,0.04)] hover:bg-white hover:border-[#d0c6b9] transition-colors"
          >
            {action.label}
          </button>
        ))}

        {/* 取消按钮 */}
        <button
          onClick={onClear}
          className="ml-auto inline-flex items-center justify-center h-8 w-8 rounded-md border border-[#e1d7c9] text-[#8d7f73] hover:text-[#5f564c] hover:bg-white transition-colors"
          title="取消选中模式"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
