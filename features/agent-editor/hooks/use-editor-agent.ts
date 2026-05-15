import { useCallback, useEffect } from "react";
import { useEditorState } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { getAISelectionRange } from "@/features/rich-editor/extensions/ai-selection-highlight";
import { createEditorAIRequest } from "../services/editor-ai-context";
import type { DocumentSelectionReference } from "../chat/types";
import type {
  EditorMode,
  ChatContext,
  UseEditorAgentOptions,
  UseEditorAgentReturn,
} from "../types";

export function useEditorAgent({
  editor,
}: UseEditorAgentOptions): UseEditorAgentReturn {

  // 订阅 Plugin.state from/to 数据变化
  const selectionInfo = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return null;

      const range = getAISelectionRange(currentEditor.state);
      if (!range) return null;

      const text = currentEditor.state.doc.textBetween(
        range.from,
        range.to,
        " ",
      );

      if (!text.trim()) return null;

      return { ...range, text };
    },
    equalityFn: (a, b) => {
      if (!a && !b) return true;
      if (!a || !b) return false;

      return a.from === b.from && a.to === b.to && a.text === b.text;
    },
  });
  const mode: EditorMode = selectionInfo ? "selection" : "fulltext";

  // ===================================================================
  // 监听选区变化，触发 plugin.state 中 from/to 更新并设置 Decoration 高亮
  // ===================================================================

  const setCurrentSelectionAsDiscussion = useCallback(() => {
    if (!editor) return false;

    const { from, to, empty } = editor.state.selection;
    if (empty) return false;

    const text = editor.state.doc.textBetween(from, to, " ");
    if (!text.trim()) return false;

    editor.commands.setAISelectionHighlight(from, to);
    return true;
  }, [editor]);


  useEffect(() => {
    if (!editor) return;

    editor.on("selectionUpdate", setCurrentSelectionAsDiscussion);

    return () => {
      editor.off("selectionUpdate", setCurrentSelectionAsDiscussion);
    };
  }, [editor, setCurrentSelectionAsDiscussion]);

  // ===============================================
  // 清除选区
  // ===============================================

  // 手动清除选区
  const clearSelectionMode = useCallback(() => {
    if (!editor) return;

    editor.commands.clearAISelectionHighlight();
  }, [editor]);

  // ===============================================
  // 更新编辑器
  // ===============================================

  // 替换选中内容
  const replaceSelection = useCallback(
    (newText: string) => {
      if (!editor) return false;

      const range = getAISelectionRange(editor.state);
      if (!range) return false;

      // 执行替换
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .deleteSelection()
        .insertContent(newText)
        .run();

      // 清除高亮
      clearSelectionMode();

      return true;
    },
    [editor, clearSelectionMode],
  );

  // 替换指定位置内容（全文模式下使用）
  const replaceAt = useCallback(
    (from: number, to: number, newText: string) => {
      if (!editor) return false;

      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .deleteSelection()
        .insertContent(newText)
        .run();

      return true;
    },
    [editor],
  );

  // 根据原文查找并替换（全文模式下，没有 position 时使用）
  const replaceText = useCallback(
    (originalText: string, newText: string) => {
      if (!editor) return false;

      // 使用 ProseMirror 的文档遍历来精确查找文本位置
      let foundFrom = -1;
      let foundTo = -1;

      editor.state.doc.descendants((node, pos) => {
        if (foundFrom !== -1) return false; // 已找到，停止遍历

        if (node.isText && node.text) {
          const index = node.text.indexOf(originalText);
          if (index !== -1) {
            foundFrom = pos + index;
            foundTo = foundFrom + originalText.length;
            return false; // 停止遍历
          }
        }
        return true; // 继续遍历子节点
      });

      if (foundFrom === -1) return false;

      // 执行替换
      editor
        .chain()
        .focus()
        .setTextSelection({ from: foundFrom, to: foundTo })
        .deleteSelection()
        .insertContent(newText)
        .run();

      return true;
    },
    [editor],
  );

  // 滚动到指定位置
  const scrollToPosition = useCallback(
    (from: number) => {
      if (!editor) return;

      editor.commands.setTextSelection(from);
      editor.commands.scrollIntoView();
    },
    [editor],
  );

  // ===============================================
  // Inline Diff 相关方法
  // ===============================================

  // 插入 diff 节点（指定位置）
  const insertDiffNode = useCallback(
    (from: number, to: number, newText: string, suggestionId: string) => {
      if (!editor) return false;
      editor.commands.insertDiffNode(from, to, newText, suggestionId);
      return true;
    },
    [editor],
  );

  // 根据原文查找并插入 diff 节点
  const insertDiffByText = useCallback(
    (originalText: string, newText: string, suggestionId: string) => {
      if (!editor) return false;

      // 查找原文位置
      let foundFrom = -1;
      let foundTo = -1;

      editor.state.doc.descendants((node, pos) => {
        if (foundFrom !== -1) return false;

        if (node.isText && node.text) {
          const index = node.text.indexOf(originalText);
          if (index !== -1) {
            foundFrom = pos + index;
            foundTo = foundFrom + originalText.length;
            return false;
          }
        }
        return true;
      });

      if (foundFrom === -1) return false;

      editor.commands.insertDiffNode(foundFrom, foundTo, newText, suggestionId);
      return true;
    },
    [editor],
  );

  // 批量插入 diff 节点（处理多个建议）
  const insertMultipleDiffs = useCallback(
    (
      suggestions: Array<{
        originalText: string;
        newText: string;
        suggestionId: string;
      }>,
    ) => {
      if (!editor) return;

      // 先收集所有位置，从后向前插入避免位置偏移
      const positions: Array<{
        from: number;
        to: number;
        newText: string;
        suggestionId: string;
      }> = [];

      suggestions.forEach(({ originalText, newText, suggestionId }) => {
        let foundFrom = -1;
        let foundTo = -1;

        editor.state.doc.descendants((node, pos) => {
          if (foundFrom !== -1) return false;

          if (node.isText && node.text) {
            const index = node.text.indexOf(originalText);
            if (index !== -1) {
              foundFrom = pos + index;
              foundTo = foundFrom + originalText.length;
              return false;
            }
          }
          return true;
        });

        if (foundFrom !== -1) {
          positions.push({ from: foundFrom, to: foundTo, newText, suggestionId });
        }
      });

      // 按位置从后向前排序
      positions.sort((a, b) => b.from - a.from);

      // 逐个插入（从后向前）
      positions.forEach(({ from, to, newText, suggestionId }) => {
        editor.commands.insertDiffNode(from, to, newText, suggestionId);
      });
    },
    [editor],
  );

  // 接受 diff
  const acceptDiff = useCallback(
    (suggestionId: string) => {
      if (!editor) return false;
      editor.commands.acceptDiff(suggestionId);
      return true;
    },
    [editor],
  );

  // 拒绝 diff
  const rejectDiff = useCallback(
    (suggestionId: string) => {
      if (!editor) return false;
      editor.commands.rejectDiff(suggestionId);
      return true;
    },
    [editor],
  );

  // 清除所有 diff 节点（恢复原文）
  const clearAllDiffs = useCallback(() => {
    if (!editor) return;
    editor.commands.clearAllDiffs();
  }, [editor]);

  // 接受所有 diff
  const acceptAllDiffs = useCallback(() => {
    if (!editor) return;
    editor.commands.acceptAllDiffs();
  }, [editor]);

  // 获取上下文（用于发送给 AI）
  const getContext = useCallback((): ChatContext => {
    if (!editor) {
      return { mode: "fulltext", content: "" };
    }

    const range = getAISelectionRange(editor.state);
    if (range) {
      const text = editor.state.doc.textBetween(range.from, range.to, " ");
      if (!text.trim()) {
        return { mode: "fulltext", content: editor.getText() };
      }

      const selection = { ...range, text };

      return {
        mode: "selection",
        content: text,
        selection,
      };
    }

    // 全文模式：获取纯文本内容
    const content = editor.getText();
    return { mode: "fulltext", content };
  }, [editor]);

  const createAIRequest = useCallback(
    (message: string) => {
      if (!editor) return null;
      return createEditorAIRequest(editor, message)?.request ?? null;
    },
    [editor],
  );

  // ===============================================
  // 构建选区引用（用于 completion 请求的 at_references）
  // ===============================================

  /**
   * 从当前 plugin state 读取选区范围，构建带 selection boundary
   * 标记的完整 HTML 文档引用。
   *
   * 无选区时返回 null（全文模式下不需要 reference）。
   */
  const buildSelectionReference = useCallback(
    (originId = "document"): DocumentSelectionReference | null => {
      if (!editor) return null;

      const range = getAISelectionRange(editor.state);
      if (!range || range.from >= range.to) return null;

      const startBoundary = editor.state.schema.nodes.selectionStartBoundary;
      const endBoundary = editor.state.schema.nodes.selectionEndBoundary;
      if (!startBoundary || !endBoundary) return null;

      const tr = editor.state.tr
        .insert(range.to, endBoundary.create())
        .insert(range.from, startBoundary.create());
      const serializer = DOMSerializer.fromSchema(editor.state.schema);
      const container = document.createElement("div");
      container.appendChild(serializer.serializeFragment(tr.doc.content));

      return {
        type: "selection",
        content_with_selection: container.innerHTML,
        is_full_content: true,
        origin_id: originId,
        origin_type: "document" as const,
      };
    },
    [editor],
  );

  return {
    editor,
    mode,
    selectionInfo,
    clearSelectionMode,
    replaceSelection,
    replaceAt,
    replaceText,
    scrollToPosition,
    getContext,
    createAIRequest,
    buildSelectionReference,
    // Inline Diff 相关
    insertDiffNode,
    insertDiffByText,
    insertMultipleDiffs,
    acceptDiff,
    rejectDiff,
    clearAllDiffs,
    acceptAllDiffs,
  };
}
