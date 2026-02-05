"use client";

import { useCallback } from "react";
import type { Suggestion } from "../types";

interface SuggestionCardProps {
  suggestion: Suggestion;
  onApply: (suggestion: Suggestion) => void;
  onAccept?: (suggestion: Suggestion) => void;
  onReject?: (suggestion: Suggestion) => void;
  onLocate?: (suggestion: Suggestion) => void;
}

export function SuggestionCard({
  suggestion,
  onApply,
  onAccept,
  onReject,
  onLocate,
}: SuggestionCardProps) {
  const { label, originalText, newText, status, type } = suggestion;

  const isIdle = status === "idle";
  const isChecked = status === "checked";
  const isCanceled = status === "canceled";
  const isFailed = status === "failed";

  const handleApply = useCallback(() => {
    if (isIdle) {
      onApply(suggestion);
    }
  }, [isIdle, onApply, suggestion]);

  const handleAccept = useCallback(() => {
    if (isIdle && onAccept) {
      onAccept(suggestion);
    }
  }, [isIdle, onAccept, suggestion]);

  const handleReject = useCallback(() => {
    if (isIdle && onReject) {
      onReject(suggestion);
    }
  }, [isIdle, onReject, suggestion]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(newText);
  }, [newText]);

  const handleLocate = useCallback(() => {
    if (onLocate) {
      onLocate(suggestion);
    }
  }, [onLocate, suggestion]);

  // 卡片样式
  const cardClassName = [
    "border rounded-md p-3 mb-2 shadow-[0_1px_0_rgba(15,23,42,0.05)]",
    isChecked && "border-[#6bbf7a] bg-[#f1fbf4]",
    isCanceled && "opacity-60 border-[#e0d6ca] bg-[#f7f2ec]",
    isFailed && "border-[#e16b6b] bg-[#fff1f1]",
    isIdle && "border-[#e6ddd1] bg-[#fffaf4]",
  ]
    .filter(Boolean)
    .join(" ");

  const ghostButtonClass =
    "px-3 py-1 text-[11px] font-medium rounded-md border border-[#e1d7c9] text-[#6f6258] bg-white/80 hover:bg-white hover:text-[#463d34] transition-colors";
  const acceptButtonClass =
    "px-3 py-1 text-[11px] font-medium rounded-md bg-[#1f7a5b] text-white shadow-[0_2px_6px_rgba(31,122,91,0.22)] hover:bg-[#17624a] transition-colors";
  const rejectButtonClass =
    "px-3 py-1 text-[11px] font-medium rounded-md bg-[#b24a4a] text-white shadow-[0_2px_6px_rgba(178,74,74,0.22)] hover:bg-[#9f3e3e] transition-colors";

  return (
    <div className={cardClassName}>
      {/* 标题 */}
      {label && (
        <div className="text-xs font-semibold text-[#6f6258] mb-2">
          {label}
        </div>
      )}

      {/* 内容区域 */}
      {type === "edit" ? (
        // 全文模式：显示 diff 样式
        <div className="rounded-md border border-[#ede4d9] bg-[#fffdf9] p-2 space-y-2">
          <div className="flex items-start gap-2 rounded-sm bg-[#fff1f1] px-2 py-1 text-[#b42318]">
            <span className="text-[11px] font-semibold">-</span>
            <span className="text-[12.5px] leading-5 line-through whitespace-pre-wrap">
              {originalText}
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-sm bg-[#ecfdf3] px-2 py-1 text-[#0f766e]">
            <span className="text-[11px] font-semibold">+</span>
            <span className="text-[12.5px] leading-5 whitespace-pre-wrap">
              {newText}
            </span>
          </div>
        </div>
      ) : (
        // 选中模式：只显示新内容
        <div className="rounded-md border border-[#ede4d9] bg-[#fffdf9] px-3 py-2 text-[13px] leading-6 text-[#2f2a24] whitespace-pre-wrap">
          {newText}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 mt-3">
        {type === "edit" && onLocate && isIdle && (
          <button
            onClick={handleLocate}
            className={ghostButtonClass}
          >
            定位
          </button>
        )}
        <button
          onClick={handleCopy}
          className={ghostButtonClass}
        >
          复制
        </button>

        {type === "edit" ? (
          // 全文模式：显示接受/拒绝按钮
          <>
            {isIdle && (
              <>
                <button
                  onClick={handleReject}
                  className={rejectButtonClass}
                >
                  ✗ 拒绝
                </button>
                <button
                  onClick={handleAccept}
                  className={acceptButtonClass}
                >
                  ✓ 接受
                </button>
              </>
            )}
            {isChecked && (
              <span className="px-3 py-1 text-[11px] font-medium rounded-md bg-[#1f7a5b] text-white">
                ✓ 已接受
              </span>
            )}
            {isCanceled && (
              <span className="px-3 py-1 text-[11px] font-medium rounded-md bg-[#e1d9cf] text-[#6f6258]">
                已拒绝
              </span>
            )}
            {isFailed && (
              <span className="px-3 py-1 text-[11px] font-medium rounded-md bg-[#b23a3a] text-white">
                ✗ 失败
              </span>
            )}
          </>
        ) : (
          // 选中模式：显示应用按钮
          <button
            onClick={handleApply}
            disabled={!isIdle}
            className={[
              "px-3 py-1 text-[11px] font-medium rounded-md transition-colors",
              isIdle &&
                "bg-[#1f2a44] text-white shadow-[0_2px_6px_rgba(31,42,68,0.25)] hover:bg-[#162036]",
              isChecked && "bg-[#1f7a5b] text-white cursor-default",
              isCanceled && "bg-[#e1d9cf] text-[#6f6258] cursor-not-allowed",
              isFailed && "bg-[#b24a4a] text-white cursor-not-allowed",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isChecked ? "✓ 已应用" : isFailed ? "✗ 应用失败" : "应用"}
          </button>
        )}
      </div>
    </div>
  );
}
