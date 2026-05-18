"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { AgentChatState, AgentChatToolCallBlock } from "../chat/types";
import type { ProposeEditsInput } from "@/src/server/session-chat/tools/propose-edits";
import type { ApplyEditInput } from "@/src/server/session-chat/tools/apply-edit";
import { editApplyRecords } from "../services/edit-apply-records";
import {
  locateParagraph,
  locateParagraphSequence,
  hasDiffBlockBySuggestionId,
} from "../services/locate-paragraph";
import { createApplyEditReplacementNodes } from "../services/apply-edit-replacement";
import { getAISelectionRange } from "@/features/rich-editor/extensions/ai-selection-highlight";

// ============================================================
// Helpers
// ============================================================

/**
 * 安全地从 tool_call block 的 input 中提取第一个元素并断言类型。
 * SSE 累积时 input 是数组，第一个元素为工具入参。
 */
function firstInput<T>(block: AgentChatToolCallBlock): T | null {
  return Array.isArray(block.input) && block.input.length > 0
    ? (block.input[0] as T)
    : null;
}

// ============================================================
// Hook
// ============================================================

interface UseApplyAgentEditsOptions {
  editor: Editor | null;
  chatState: AgentChatState | undefined;
  activeChatSessionId: string | null;
}

/**
 * 负责将 AI 工具调用（propose_edits / apply_edit）的结果应用到编辑器中。
 *
 * 去重策略：
 * - 使用内存 editApplyRecords 记录已处理的 (toolCallId, editId) 对
 * - SSE 重连、resume、组件 re-mount 都会触发 effect 重跑，靠 lookup 去重
 */
export function useApplyAgentEdits({
  editor,
  chatState,
  activeChatSessionId,
}: UseApplyAgentEditsOptions) {
  const [retryTick, setRetryTick] = useState(0);

  const applyOneEdit = useCallback(
    (params: {
      toolCallId: string;
      editId: string;
      originalText: string;
      newText: string;
      occurrenceIndex: number;
      mode: "propose" | "apply";
    }) => {
      // 已处理过的不重复执行
      const existing = editApplyRecords.lookup(params.toolCallId, params.editId);
      if (existing) return;

      if (!editor) {
        editApplyRecords.markFailed(params.toolCallId, params.editId, "editor-not-ready");
        setRetryTick((t) => t + 1);
        return;
      }

      // propose 模式：兜底检查 DiffBlock 是否已存在（内存记录丢失时的保护）
      if (params.mode === "propose" && hasDiffBlockBySuggestionId(editor.state.doc, params.editId)) {
        editApplyRecords.markApplied(params.toolCallId, params.editId);
        setRetryTick((t) => t + 1);
        return;
      }

      const located =
        locateParagraph(editor.state.doc, params.originalText, params.occurrenceIndex) ??
        (params.mode === "apply"
          ? locateParagraphSequence(
              editor.state.doc,
              params.originalText,
              params.occurrenceIndex,
            )
          : null);

      if (!located) {
        if (params.mode === "apply") {
          const range = getAISelectionRange(editor.state);
          const selectedText = range
            ? editor.state.doc.textBetween(range.from, range.to, "\n\n")
            : "";

          if (range && selectedText === params.originalText) {
            const { tr, schema } = editor.state;
            if (params.newText === "") {
              editor.view.dispatch(tr.delete(range.from, range.to));
            } else {
              editor.view.dispatch(
                tr.replaceWith(
                  range.from,
                  range.to,
                  createApplyEditReplacementNodes(schema, params.newText),
                ),
              );
            }

            editApplyRecords.markApplied(params.toolCallId, params.editId);
            setRetryTick((t) => t + 1);
            return;
          }
        }

        editApplyRecords.markFailed(params.toolCallId, params.editId, "not-found");
        setRetryTick((t) => t + 1);
        return;
      }

      if (params.mode === "propose") {
        editor.commands.insertParagraphDiffBlock(
          located.from,
          located.to,
          params.originalText,
          params.newText,
          params.editId,
        );
      } else {
        // apply_edit：整段替换（original_text 必须是完整段落文本）
        const { tr, schema } = editor.state;
        if (params.newText === "") {
          editor.view.dispatch(tr.delete(located.from, located.to));
        } else {
          editor.view.dispatch(
            tr.replaceWith(
              located.from,
              located.to,
              createApplyEditReplacementNodes(schema, params.newText),
            ),
          );
        }
      }

      editApplyRecords.markApplied(params.toolCallId, params.editId);
      setRetryTick((t) => t + 1);
    },
    [editor],
  );

  const applyProposeEdits = useCallback(
    (block: AgentChatToolCallBlock) => {
      if (block.status !== "FINISHED") return;
      const input = firstInput<ProposeEditsInput>(block);
      if (!input?.edits?.length) return;

      if (!editor) {
        for (const edit of input.edits) {
          editApplyRecords.markFailed(block.tool_call_id, edit.id, "editor-not-ready");
        }
        setRetryTick((t) => t + 1);
        return;
      }

      // 收集位置后倒序应用，避免插入 DiffBlock 后位置偏移
      const positioned = input.edits
        .map((edit) => ({
          edit,
          pos: locateParagraph(editor.state.doc, edit.original_text, edit.occurrence_index ?? 0),
        }))
        .filter((item): item is typeof item & { pos: NonNullable<typeof item.pos> } => item.pos !== null)
        .sort((a, b) => b.pos.from - a.pos.from);

      for (const { edit } of positioned) {
        applyOneEdit({
          toolCallId: block.tool_call_id,
          editId: edit.id,
          originalText: edit.original_text,
          newText: edit.new_text,
          occurrenceIndex: edit.occurrence_index ?? 0,
          mode: "propose",
        });
      }

      const positionedIds = new Set(positioned.map(({ edit }) => edit.id));
      for (const edit of input.edits) {
        if (!positionedIds.has(edit.id)) {
          applyOneEdit({
            toolCallId: block.tool_call_id,
            editId: edit.id,
            originalText: edit.original_text,
            newText: edit.new_text,
            occurrenceIndex: edit.occurrence_index ?? 0,
            mode: "propose",
          });
        }
      }
    },
    [applyOneEdit, editor],
  );

  const applyApplyEdit = useCallback(
    (block: AgentChatToolCallBlock) => {
      if (block.status !== "FINISHED") return;
      const input = firstInput<ApplyEditInput>(block);
      if (!input?.edits?.length) return;

      if (!editor) {
        for (let i = 0; i < input.edits.length; i++) {
          editApplyRecords.markFailed(
            block.tool_call_id,
            `${block.tool_call_id}-${i}`,
            "editor-not-ready",
          );
        }
        setRetryTick((t) => t + 1);
        return;
      }

      // 收集位置后倒序应用，避免替换后位置偏移
      const positioned = input.edits
        .map((edit, index) => ({
          edit,
          index,
          pos: locateParagraph(editor.state.doc, edit.original_text, edit.occurrence_index ?? 0),
        }))
        .filter((item): item is typeof item & { pos: NonNullable<typeof item.pos> } => item.pos !== null)
        .sort((a, b) => b.pos.from - a.pos.from);

      for (const { edit, index } of positioned) {
        applyOneEdit({
          toolCallId: block.tool_call_id,
          editId: `${block.tool_call_id}-${index}`,
          originalText: edit.original_text,
          newText: edit.new_text,
          occurrenceIndex: edit.occurrence_index ?? 0,
          mode: "apply",
        });
      }

      const positionedIndexes = new Set(positioned.map(({ index }) => index));
      for (let index = 0; index < input.edits.length; index++) {
        if (!positionedIndexes.has(index)) {
          const edit = input.edits[index];
          applyOneEdit({
            toolCallId: block.tool_call_id,
            editId: `${block.tool_call_id}-${index}`,
            originalText: edit.original_text,
            newText: edit.new_text,
            occurrenceIndex: edit.occurrence_index ?? 0,
            mode: "apply",
          });
        }
      }
    },
    [applyOneEdit, editor],
  );

  // 自动扫描所有已完成的工具调用并应用
  // chatState 引用在 SSE patch 时会变化，靠 editApplyRecords.lookup 去重避免重复应用
  useEffect(() => {
    if (!activeChatSessionId || !chatState) return;
    for (const message of chatState.chat_messages) {
      if (message.role !== "ASSISTANT") continue;
      for (const block of message.blocks) {
        if (block.type !== "tool_call") continue;
        const toolBlock = block as AgentChatToolCallBlock;
        if (toolBlock.status !== "FINISHED") continue;
        if (toolBlock.tool_name === "propose_edits") {
          applyProposeEdits(toolBlock);
        } else if (toolBlock.tool_name === "apply_edit") {
          applyApplyEdit(toolBlock);
        }
      }
    }
  }, [activeChatSessionId, chatState, applyProposeEdits, applyApplyEdit, retryTick]);

  /**
   * 触发重试：子组件在调用前已通过 editApplyRecords.clearForEdit 清除记录，
   * 这里只需 bump retryTick 让 effect 重新扫描。
   */
  const handleRetryEdit = useCallback(
    (_toolCallId: string, _editId: string) => {
      setRetryTick((t) => t + 1);
    },
    [],
  );

  return { retryTick, handleRetryEdit };
}
