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

export interface AIAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface AIFloatingPanelProps {
  editor: Editor;
  anchorRect: AIAnchorRect;
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
  anchorRect,
  onClose,
}: AIFloatingPanelProps) {
  const { submit: onSelectionAISubmit } = useEditorAgentActions();
  const [status, setStatus] = useState<AIStatus>("input");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 创建虚拟参考元素，基于点击时快照的坐标，整个生命周期只创建一次
  // anchorRect 是点击时的快照，面板存续期间不会变化，无需列入依赖
  const virtualReference = useRef({
    getBoundingClientRect: () => ({
      top: anchorRect.top,
      bottom: anchorRect.bottom,
      left: anchorRect.left,
      right: anchorRect.right,
      width: anchorRect.right - anchorRect.left,
      height: anchorRect.bottom - anchorRect.top,
      x: anchorRect.left,
      y: anchorRect.top,
    }),
  }).current;

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
  const isPositioned = !!elements.floating && !!floatingStyles.transform;

  // 计算安全的浮动样式
  const safeFloatingStyles = useMemo(
    () =>
      ({
        ...floatingStyles,
        visibility: isPositioned ? "visible" : "hidden",
      }) as React.CSSProperties,
    [floatingStyles, isPositioned],
  );

  // 将虚拟参考元素设置为 reference（只执行一次）
  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  // 自动聚焦输入框
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // 处理确定按钮点击
  const handleSubmit = useCallback(() => {
    const selectionRange = getAISelectionRange(editor.state);
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
  }, [editor, inputValue, onClose, onSelectionAISubmit]);

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
          disabled={!inputValue.trim()}
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </FloatingMenuLayer>
  );
}
