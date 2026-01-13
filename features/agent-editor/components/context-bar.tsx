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
  if (!selectionInfo) return null;

  // 截断显示文本（超过 20 字则截断）
  const displayText =
    selectionInfo.text.length > 20
      ? selectionInfo.text.slice(0, 20) + "..."
      : selectionInfo.text;

  const handleQuickAction = useCallback(
    (action: (typeof QUICK_ACTIONS)[number]) => {
      onQuickAction(action.key, action.prompt);
    },
    [onQuickAction]
  );

  return (
    <div className="border-b border-gray-200 p-3 bg-gray-50">
      {/* 选中内容提示 */}
      <div className="text-sm text-gray-600 mb-2">
        正在讨论：
        <span className="text-gray-800 font-medium">&quot;{displayText}&quot;</span>
      </div>

      {/* 快捷操作按钮 */}
      <div className="flex items-center gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => handleQuickAction(action)}
            className="px-3 py-1 text-sm bg-white border border-gray-200 rounded-full hover:bg-gray-100 hover:border-gray-300 transition-colors"
          >
            {action.label}
          </button>
        ))}

        {/* 取消按钮 */}
        <button
          onClick={onClear}
          className="ml-auto px-2 py-1 text-sm text-gray-400 hover:text-gray-600"
          title="取消选中模式"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
