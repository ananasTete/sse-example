"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { type Editor } from "@tiptap/react";
import { ArrowRight } from "lucide-react";
import {
  useFloating,
  offset,
  shift,
  autoUpdate,
} from "@floating-ui/react";
import { getAISelectionRange } from "../../extensions/ai-selection-highlight";
import { useEditorAgentActions } from "@/features/agent-editor/context/editor-agent-context";
import { FloatingMenuLayer } from "./floating-menu-layer";

type AIStatus = "input" | "error";

interface AIFloatingPanelProps {
  editor: Editor;
  onClose: (payload: AIPanelClosePayload) => void;
}

export interface AIPanelClosePayload {
  reason: "cancel" | "replace" | "selection-lost" | "submit";
  caretPos?: number;
}

/**
 * 独立的 AI 浮动面板组件
 * 使用 Floating UI 定位到选区位置，独立于 BubbleMenu
 */
export function AIFloatingPanel({
  editor,
  onClose,
}: AIFloatingPanelProps) {
  const { submit: onSelectionAISubmit } = useEditorAgentActions();
  const [status, setStatus] = useState<AIStatus>("input");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [transactionVersion, setTransactionVersion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleTransaction = () => {
      setTransactionVersion((version) => version + 1);
    };

    editor.on("transaction", handleTransaction);

    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [editor]);

  const selectionRange = useMemo(() => {
    const range = getAISelectionRange(editor.state);
    if (!range) return null;
    if (range.from >= range.to) return null;
    if (range.to > editor.state.doc.content.size) return null;

    return {
      from: range.from,
      to: range.to,
    };
  }, [editor, transactionVersion]);

  // 创建虚拟参考元素，基于选区位置
  const virtualReference = useMemo(() => {
    return {
      getBoundingClientRect: () => {
        if (!selectionRange) {
          return {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
          };
        }

        // 获取选区的坐标
        const fromCoords = editor.view.coordsAtPos(selectionRange.from);
        const toCoords = editor.view.coordsAtPos(selectionRange.to);

        // 计算选区的边界框
        const top = Math.min(fromCoords.top, toCoords.top);
        const bottom = Math.max(fromCoords.bottom, toCoords.bottom);
        const left = Math.min(fromCoords.left, toCoords.left);
        const right = Math.max(fromCoords.right, toCoords.right);

        return {
          top,
          bottom,
          left,
          right,
          width: right - left,
          height: bottom - top,
          x: left,
          y: top,
        };
      },
    };
  }, [editor, selectionRange]);

  const { refs, floatingStyles, elements, context } = useFloating({
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [
      offset(8),
      shift({ padding: 16 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // 判断是否已定位完成，用于处理首次渲染闪烁
  const isPositioned =
    !!selectionRange && !!elements.floating && floatingStyles.transform;

  // 计算安全的浮动样式
  const safeFloatingStyles = useMemo(
    () =>
      ({
        ...floatingStyles,
        visibility: isPositioned ? "visible" : "hidden",
      }) as React.CSSProperties,
    [floatingStyles, isPositioned],
  );

  // 将虚拟参考元素设置为 reference
  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  // 自动聚焦输入框
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!selectionRange) {
      onClose({ reason: "selection-lost" });
    }
  }, [selectionRange, onClose]);

  // 处理确定按钮点击
  const handleSubmit = useCallback(() => {
    if (!selectionRange) {
      setErrorMessage("请先选择需要处理的文本。");
      setStatus("error");
      return;
    }

    setErrorMessage(null);
    setStatus("input");

    const prompt = inputValue.trim();
    if (!prompt) {
      setErrorMessage("请输入你希望 AI 帮你做的事情。");
      setStatus("error");
      return;
    }

    const submitted = onSelectionAISubmit(prompt);
    if (!submitted) {
      setErrorMessage("当前会话正在生成，或选区已失效。");
      setStatus("error");
      return;
    }

    onClose({ reason: "submit" });
  }, [inputValue, onClose, onSelectionAISubmit, selectionRange]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose({ reason: "cancel" });
      }
    },
    [handleSubmit, onClose],
  );

  const resultClassName = [
    "ai-panel-result",
    status === "error" ? "is-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const resultContent =
    status === "error" ? errorMessage || "提交失败，请重试。" : "";

  return (
    <FloatingMenuLayer
      context={context}
      close={() => onClose({ reason: "cancel" })}
      setFloating={(node) => refs.setFloating(node)}
      floatingStyles={safeFloatingStyles}
      className="ai-floating-panel"
      floatingProps={{ onKeyDown: handleKeyDown }}
    >
      <textarea
        ref={textareaRef}
        className="ai-panel-textarea"
        placeholder="请输入你希望 AI 帮你做的事情..."
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          if (status === "error") {
            setStatus("input");
            setErrorMessage(null);
          }
        }}
        rows={2}
      />

      {status !== "input" && (
        <div className={resultClassName}>{resultContent}</div>
      )}

      <div className="ai-panel-actions">
        <button
          type="button"
          className="ai-panel-btn ai-panel-btn-cancel"
          onClick={() => onClose({ reason: "cancel" })}
        >
          取消
        </button>

        <button
          type="button"
          className="ai-panel-btn ai-panel-btn-submit"
          onClick={handleSubmit}
          disabled={!inputValue.trim() || !selectionRange}
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </FloatingMenuLayer>
  );
}
