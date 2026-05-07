import { BubbleMenu as TiptapBubbleMenu } from "@tiptap/react/menus";
import { isNodeSelection } from "@tiptap/core";
import { type Editor, useEditorState } from "@tiptap/react";
import { useState, useCallback } from "react";

import { AIButton } from "./components/ai-button";
import {
  AIFloatingPanel,
  type AIPanelClosePayload,
} from "./components/ai-floating-panel";
import "./bubble-menu.css";
import { Divider } from "./components/divider";
import { NodeTypeSelect } from "./components/node-type-select";
import { AlignSelect, type AlignId } from "./components/align-select";
import { ColorSelect } from "./components/color-select";
import { MoreMenu } from "./components/more-menu";
import { FormatButtons } from "./components/format-buttons";
import { getAISelectionRange } from "../extensions/ai-selection-highlight";
import { getActiveNodeTypeId } from "./bubble-menu-config";

interface BubbleMenuProps {
  editor: Editor;
  scrollTarget?: HTMLElement | Window | null;
  onSelectionAISubmit?: (prompt: string) => boolean;
}

const alignMatchers: Array<{
  id: AlignId;
  isActive: (editor: Editor) => boolean;
}> = [
  {
    id: "center",
    isActive: (editor) => editor.isActive({ textAlign: "center" }),
  },
  {
    id: "right",
    isActive: (editor) => editor.isActive({ textAlign: "right" }),
  },
];

function getActiveAlignId(editor: Editor): AlignId {
  return alignMatchers.find((item) => item.isActive(editor))?.id ?? "left";
}

export function BubbleMenu({
  editor,
  scrollTarget,
  onSelectionAISubmit,
}: BubbleMenuProps) {
  const [showAIPanel, setShowAIPanel] = useState(false);

  const ui = useEditorState({
    editor,
    selector: ({ editor }) => {
      const textColor = editor.getAttributes("textStyle").color || null;
      const highlightColor = editor.getAttributes("highlight").color || null;

      return {
        nodeTypeId: getActiveNodeTypeId(editor),
        alignId: getActiveAlignId(editor),
        textColor,
        highlightColor,
        isBold: editor.isActive("bold"),
        isCode: editor.isActive("code"),
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
      setShowAIPanel(false);
    },
    [editor],
  );

  // 点击 AI 按钮时，将当前选区写入统一的高亮插件状态
  const handleAIButtonClick = useCallback(() => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;

    const text = editor.state.doc.textBetween(from, to, " ");
    if (!text.trim()) return;

    editor.commands.setAISelectionHighlight(from, to);
    setShowAIPanel(true);
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
        setShowAIPanel(false);
        return;
      }

      clearAIPanelState();
    },
    [clearAIPanelState, editor],
  );

  return (
    <>
      {/* 原始工具栏 - AI 面板显示时不渲染 */}
      {!showAIPanel && (
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

          {/* Node Type Select */}
          <NodeTypeSelect
            editor={editor}
            activeTypeId={ui.nodeTypeId}
          />

          {/* Alignment Select */}
          <AlignSelect
            editor={editor}
            activeAlignId={ui.alignId}
          />

          <Divider />

          {/* Format Buttons */}
          <FormatButtons
            editor={editor}
            isBold={ui.isBold}
            isCode={ui.isCode}
            isItalic={ui.isItalic}
            isStrike={ui.isStrike}
            isUnderline={ui.isUnderline}
          />

          <Divider />

          {/* Color Select */}
          <ColorSelect
            editor={editor}
            activeTextColor={ui.textColor}
            activeHighlight={ui.highlightColor}
          />

          <Divider />

          {/* More Menu */}
          <MoreMenu editor={editor} />
        </TiptapBubbleMenu>
      )}

      {/* 独立的 AI 浮动面板 */}
      {showAIPanel && (
        <AIFloatingPanel
          editor={editor}
          onClose={handleCloseAIPanel}
          onSelectionAISubmit={onSelectionAISubmit}
        />
      )}
    </>
  );
}
