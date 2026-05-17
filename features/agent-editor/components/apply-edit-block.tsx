"use client";

import { useCallback } from "react";
import type { ApplyEditInput } from "@/src/server/session-chat/tools/apply-edit";
import { editApplyRecords } from "../services/edit-apply-records";

interface ApplyEditBlockProps {
  toolCallId: string;
  messageId: number;
  sessionId: string;
  input: ApplyEditInput;
  /** 触发重试的回调 */
  onRetry: (toolCallId: string, editId: string) => void;
}

function truncate(text: string, maxLen = 14) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function getEditId(toolCallId: string, index: number) {
  return `${toolCallId}-${index}`;
}

function getEditStatus(
  toolCallId: string,
  index: number,
): import("../services/edit-apply-records").EditApplyState | null {
  return editApplyRecords.getState(toolCallId, getEditId(toolCallId, index));
}

export function ApplyEditBlock({
  toolCallId,
  messageId,
  sessionId,
  input,
  onRetry,
}: ApplyEditBlockProps) {
  const edits = input.edits ?? [];

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const handleRetry = useCallback(
    (index: number) => {
      const editId = getEditId(toolCallId, index);
      editApplyRecords.clearForEdit(toolCallId, editId);
      onRetry(toolCallId, editId);
    },
    [toolCallId, onRetry],
  );

  // 单条 edit 的简洁展示
  if (edits.length === 1) {
    const edit = edits[0];
    const state = getEditStatus(toolCallId, 0);
    const isFailed = state?.status === "failed";

    return (
      <div className="rounded-lg border border-[#e6ddd1] bg-[#faf7f3] px-3 py-2 text-[13px]">
        <div className="flex items-center gap-1.5">
          <span className={isFailed ? "text-amber-500" : "text-green-600"}>
            {isFailed ? "⚠" : "✓"}
          </span>
          <span className="text-[#4b4e48]">
            {isFailed ? "应用失败：" : "已应用："}
            「{truncate(edit.original_text)}」
            {edit.new_text ? ` → 「${truncate(edit.new_text)}」` : " → 删除"}
          </span>
          {isFailed ? (
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-[#60635c] hover:bg-black/[0.06]"
                onClick={() => handleCopy(edit.new_text)}
              >
                复制
              </button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-[#60635c] hover:bg-black/[0.06]"
                onClick={() => handleRetry(0)}
              >
                重试
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // 多条 edits（跨段选区）
  const appliedCount = edits.filter(
    (_, i) => getEditStatus(toolCallId, i)?.status === "applied",
  ).length;
  const failedCount = edits.filter(
    (_, i) => getEditStatus(toolCallId, i)?.status === "failed",
  ).length;

  return (
    <div className="rounded-lg border border-[#e6ddd1] bg-[#faf7f3] px-3 py-2.5 text-[13px]">
      <div className="mb-1.5 font-medium text-[#4b4e48]">
        ✓ 已应用 {appliedCount}/{edits.length} 处修改
        {failedCount > 0 ? `，${failedCount} 条失败` : ""}
      </div>
      <div className="space-y-1">
        {edits.map((edit, index) => {
          const state = getEditStatus(toolCallId, index);
          const isFailed = state?.status === "failed";
          const isApplied = state?.status === "applied";

          return (
            <div key={index} className="flex items-start gap-1.5 text-[12px]">
              <span
                className={
                  isApplied
                    ? "mt-0.5 text-green-600"
                    : isFailed
                      ? "mt-0.5 text-amber-500"
                      : "mt-0.5 text-[#85877f]"
                }
              >
                {isApplied ? "✓" : isFailed ? "⚠" : "•"}
              </span>
              <span className="min-w-0 flex-1 text-[#4b4e48]">
                「{truncate(edit.original_text)}」
                {edit.new_text ? ` → 「${truncate(edit.new_text)}」` : " → 删除"}
              </span>
              {isFailed ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] text-[#60635c] hover:bg-black/[0.06]"
                    onClick={() => handleCopy(edit.new_text)}
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] text-[#60635c] hover:bg-black/[0.06]"
                    onClick={() => handleRetry(index)}
                  >
                    重试
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
