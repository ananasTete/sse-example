import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { isNodeSelection } from "@tiptap/core";
import { type Editor, useEditorState } from "@tiptap/react";
import { useState, useCallback } from "react";

import { AIButton } from "./components/ai-button";
import {
  AIFloatingPanel,
  type AIPanelClosePayload,
  type AIAnchorRect,
} from "./components/ai-floating-panel";
import "./bubble-menu.css";
import { Divider } from "./components/divider";
import { MoreMenu } from "./components/more-menu";
import { FormatButtons } from "./components/format-buttons";
import { getAISelectionRange } from "../extensions/ai-selection-highlight";

interface BubbleMenuProps {
  editor: Editor;
  scrollTarget?: HTMLElement | Window | null;
}

export function BubbleMenu({
  editor,
  scrollTarget,
}: BubbleMenuProps) {
  const [aiAnchorRect, setAIAnchorRect] = useState<AIAnchorRect | null>(null);

  const ui = useEditorState({
    editor,
    selector: ({ editor }) => {
      return {
        isBold: editor.isActive("bold"),
        isItalic: editor.isActive("italic"),
        isStrike: editor.isActive("strike"),
        isUnderline: editor.isActive("underline"),
      };
    },
  });

  const clearAIPanelState = useCallback(
    (caretPos?: number) => {
      if (typeof caretPos === "number") {
        editor.commands.setTextSelection(caretPos);
      }

      editor.commands.clearAISelectionHighlight();
      setAIAnchorRect(null);
    },
    [editor],
  );

  // 点击 AI 按钮时，将当前选区写入统一的高亮插件状态，并快照坐标
  const handleAIButtonClick = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;

    const text = editor.state.doc.textBetween(from, to, " ");
    if (!text.trim()) return;

    // 设置选取高亮（ use-agent-editor 中会有自动划词设置高亮这里还要设置是为了避免 AI 面板的选区依赖其他功能 ）
    editor.commands.setAISelectionHighlight(from, to);

    // 保存选区静态 rect 用于 AI 面板创建 virtualReference 来定位
    const fromCoords = editor.view.coordsAtPos(from);
    const toCoords = editor.view.coordsAtPos(to);
    
    setAIAnchorRect({
      top: Math.min(fromCoords.top, toCoords.top),
      bottom: Math.max(fromCoords.bottom, toCoords.bottom),
      left: Math.min(fromCoords.left, toCoords.left),
      right: Math.max(fromCoords.right, toCoords.right),
    });
  }, [editor]);

  // 关闭 AI 面板时，清除高亮
  const handleCloseAIPanel = useCallback(
    (payload: AIPanelClosePayload) => {
      if (
        payload.reason === "replace" &&
        typeof payload.caretPos === "number"
      ) {
        clearAIPanelState(payload.caretPos);
        return;
      }

      if (payload.reason === "cancel") {
        clearAIPanelState(getAISelectionRange(editor.state)?.to);
        return;
      }

      if (payload.reason === "submit") {
        setAIAnchorRect(null);
        return;
      }

      clearAIPanelState();
    },
    [clearAIPanelState, editor],
  );

  return (
    <>
      {/* 原始工具栏 - AI 面板显示时不渲染 */}
      {!aiAnchorRect && (
        <TiptapBubbleMenu
          editor={editor}
          pluginKey="richEditorBubbleMenu"
          className="bubble-menu"
          updateDelay={100}
          resizeDelay={0}
          options={{
            placement: "top",
            offset: 8,
            flip: false,
            shift: {
              padding: 12,
            },
            inline: true,
            scrollTarget: scrollTarget ?? undefined,
          }}
          shouldShow={({ state }) => {
            const { selection, doc } = state;
            const selectedText = doc
              .textBetween(selection.from, selection.to)
              .trim();

            return (
              editor.isEditable &&
              !isNodeSelection(selection) &&
              !selection.empty &&
              selectedText.length > 0
            );
          }}
        >
          {/* AI Button */}
          <AIButton onClick={handleAIButtonClick} />

          <Divider />

          {/* Format Buttons */}
          <FormatButtons
            editor={editor}
            isBold={ui.isBold}
            isItalic={ui.isItalic}
            isStrike={ui.isStrike}
            isUnderline={ui.isUnderline}
          />

          <Divider />

          {/* More Menu */}
          <MoreMenu editor={editor} />
        </TiptapBubbleMenu>
      )}

      {/* 独立的 AI 浮动面板 */}
      {aiAnchorRect && (
        <AIFloatingPanel
          editor={editor}
          anchorRect={aiAnchorRect}
          onClose={handleCloseAIPanel}
        />
      )}
    </>
  );
}
