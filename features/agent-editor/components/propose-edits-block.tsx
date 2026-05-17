"use client";

import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import type { ProposeEditsInput } from "@/src/server/session-chat/tools/propose-edits";
import { editApplyRecords } from "../services/edit-apply-records";
import { locateParagraph } from "../services/locate-paragraph";

interface ProposeEditsBlockProps {
  toolCallId: string;
  messageId: number;
  sessionId: string;
  input: ProposeEditsInput;
  editor: Editor | null;
  /** 触发重试的回调（父组件重新执行应用流程） */
  onRetry: (toolCallId: string, editId: string) => void;
}

function truncate(text: string, maxLen = 12) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function getEditStatus(
  toolCallId: string,
  editId: string,
) {
  return editApplyRecords.getState(toolCallId, editId);
}

export function ProposeEditsBlock({
  toolCallId,
  messageId,
  sessionId,
  input,
  editor,
  onRetry,
}: ProposeEditsBlockProps) {
  const edits = input.edits ?? [];

  const handleScrollTo = useCallback(
    (suggestionId: string) => {
      if (!editor) return;
      let found = false;
      editor.state.doc.descendants((node, pos) => {
        if (found) return false;
        if (
          node.type.name === "diffBlock" &&
          node.attrs.suggestionId === suggestionId
        ) {
          editor.commands.setTextSelection(pos);
          editor.commands.scrollIntoView();
          found = true;
          return false;
        }
        return true;
      });
    },
    [editor],
  );

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const handleRetry = useCallback(
    (editId: string) => {
      editApplyRecords.clearForEdit(toolCallId, editId);
      onRetry(toolCallId, editId);
    },
    [toolCallId, onRetry],
  );

  const appliedCount = edits.filter((edit) => {
    const state = getEditStatus(toolCallId, edit.id);
    return state?.status === "applied";
  }).length;

  const failedEdits = edits.filter((edit) => {
    const state = getEditStatus(toolCallId, edit.id);
    return state?.status === "failed";
  });

  return (
    <div className="rounded-lg border border-[#e6ddd1] bg-[#faf7f3] px-3 py-2.5 text-[13px]">
      <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[#4b4e48]">
        <span>✎</span>
        <span>
          已建议 {edits.length} 处修改
          {appliedCount > 0 && appliedCount < edits.length
            ? `（已应用 ${appliedCount} 条）`
            : appliedCount === edits.length && edits.length > 0
              ? "（全部已应用）"
              : ""}
        </span>
      </div>

      <div className="space-y-1">
        {edits.map((edit) => {
          const state = getEditStatus(toolCallId, edit.id);
          const isFailed = state?.status === "failed";
          const isApplied = state?.status === "applied";

          return (
            <div
              key={edit.id}
              className="flex items-start gap-1.5 text-[12px]"
            >
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

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="text-left text-[#4b4e48] hover:text-[#20231f] hover:underline"
                  onClick={() => handleScrollTo(edit.id)}
                  title="跳转到编辑器中的修改位置"
                >
                  「{truncate(edit.original_text)}」
                  {edit.new_text ? ` → 「${truncate(edit.new_text)}」` : " → 删除"}
                </button>
                {edit.rationale ? (
                  <span className="ml-1 text-[#85877f]">{edit.rationale}</span>
                ) : null}
              </div>

              {isFailed ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] text-[#60635c] hover:bg-black/[0.06]"
                    onClick={() => handleCopy(edit.new_text)}
                    title="复制新文本到剪贴板"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] text-[#60635c] hover:bg-black/[0.06]"
                    onClick={() => handleRetry(edit.id)}
                    title="重新尝试定位并应用"
                  >
                    重试
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {failedEdits.length > 0 ? (
        <div className="mt-2 text-[11px] text-[#85877f]">
          {failedEdits.length} 条无法定位，可复制后手动粘贴，或撤销文档修改后重试
        </div>
      ) : null}
    </div>
  );
}
