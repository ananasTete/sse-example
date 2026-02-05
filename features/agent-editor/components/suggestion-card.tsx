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
    "border rounded-lg p-3 mb-2",
    isChecked && "border-green-500 bg-green-50",
    isCanceled && "opacity-50 border-gray-300",
    isFailed && "border-red-500 bg-red-50",
    isIdle && "border-gray-200 bg-white",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClassName}>
      {/* 标题 */}
      {label && (
        <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      )}

      {/* 内容区域 */}
      {type === "edit" ? (
        // 全文模式：显示 diff 样式
        <div className="text-sm space-y-1">
          <div className="text-red-600 line-through">- {originalText}</div>
          <div className="text-green-600">+ {newText}</div>
        </div>
      ) : (
        // 选中模式：只显示新内容
        <div className="text-sm text-gray-800 whitespace-pre-wrap">
          {newText}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 mt-3">
        {type === "edit" && onLocate && isIdle && (
          <button
            onClick={handleLocate}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
          >
            定位
          </button>
        )}
        <button
          onClick={handleCopy}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
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
                  className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
                >
                  ✗ 拒绝
                </button>
                <button
                  onClick={handleAccept}
                  className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600"
                >
                  ✓ 接受
                </button>
              </>
            )}
            {isChecked && (
              <span className="px-3 py-1 text-sm rounded bg-green-500 text-white">
                ✓ 已接受
              </span>
            )}
            {isCanceled && (
              <span className="px-3 py-1 text-sm rounded bg-gray-300 text-gray-500">
                已拒绝
              </span>
            )}
            {isFailed && (
              <span className="px-3 py-1 text-sm rounded bg-red-500 text-white">
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
              "px-3 py-1 text-sm rounded",
              isIdle && "bg-blue-500 text-white hover:bg-blue-600",
              isChecked && "bg-green-500 text-white cursor-default",
              isCanceled && "bg-gray-300 text-gray-500 cursor-not-allowed",
              isFailed && "bg-red-500 text-white cursor-not-allowed",
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
