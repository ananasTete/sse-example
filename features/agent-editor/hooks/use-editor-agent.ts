import { useCallback, useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import type {
  EditorMode,
  SelectionInfo,
  ChatContext,
  UseEditorAgentOptions,
  UseEditorAgentReturn,
} from "../types";

export function useEditorAgent({
  editor,
}: UseEditorAgentOptions): UseEditorAgentReturn {
  const [mode, setMode] = useState<EditorMode>("fulltext");
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(
    null
  );

  // 激活选中模式：检查编辑器是否有选区，有则触发高亮
  const activateSelectionMode = useCallback(() => {
    if (!editor) return false;

    const { from, to } = editor.state.selection;
    // 检查是否有实际选区（不是光标）
    if (from === to) return false;

    const text = editor.state.doc.textBetween(from, to, " ");
    if (!text.trim()) return false;

    // 设置高亮
    editor.commands.setAISelectionHighlight(from, to);

    // 更新状态
    setSelectionInfo({ from, to, text });
    setMode("selection");

    return true;
  }, [editor]);

  // 清除选中模式
  const clearSelectionMode = useCallback(() => {
    if (!editor) return;

    editor.commands.clearAISelectionHighlight();

    // 清除编辑器选区，将光标移到选区末尾，防止再次点击输入框时重新激活
    const { to } = editor.state.selection;
    editor.commands.setTextSelection(to);

    setSelectionInfo(null);
    setMode("fulltext");
  }, [editor]);

  // 替换选中内容
  const replaceSelection = useCallback(
    (newText: string) => {
      if (!editor || !selectionInfo) return false;

      const { from, to } = selectionInfo;

      // 执行替换
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .deleteSelection()
        .insertContent(newText)
        .run();

      // 清除高亮
      clearSelectionMode();

      return true;
    },
    [editor, selectionInfo, clearSelectionMode]
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
    [editor]
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
    [editor]
  );

  // 滚动到指定位置
  const scrollToPosition = useCallback(
    (from: number) => {
      if (!editor) return;

      editor.commands.setTextSelection(from);
      editor.commands.scrollIntoView();
    },
    [editor]
  );

  // 获取上下文（用于发送给 AI）
  const getContext = useCallback((): ChatContext => {
    if (!editor) {
      return { mode: "fulltext", content: "" };
    }

    if (mode === "selection" && selectionInfo) {
      return {
        mode: "selection",
        content: selectionInfo.text,
        selection: selectionInfo,
      };
    }

    // 全文模式：获取纯文本内容
    const content = editor.getText();
    return { mode: "fulltext", content };
  }, [editor, mode, selectionInfo]);

  // 使用 ref 存储最新的 mode 值，避免事件监听器频繁重新绑定
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // 监听编辑器点击事件，清除选中模式
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      if (modeRef.current === "selection") {
        clearSelectionMode();
      }
    };

    // 监听编辑器的 focus 事件
    editor.on("focus", handleFocus);

    return () => {
      editor.off("focus", handleFocus);
    };
  }, [editor, clearSelectionMode]);

  return {
    mode,
    selectionInfo,
    activateSelectionMode,
    clearSelectionMode,
    replaceSelection,
    replaceAt,
    replaceText,
    scrollToPosition,
    getContext,
  };
}
