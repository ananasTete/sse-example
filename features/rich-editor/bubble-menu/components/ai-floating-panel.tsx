"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { type Editor } from "@tiptap/react";
import { Loader2, ArrowRight } from "lucide-react";
import { createParser } from "eventsource-parser";
import {
  useFloating,
  offset,
  shift,
  autoUpdate,
} from "@floating-ui/react";
import { getAISelectionRange } from "../../extensions/ai-selection-highlight";
import {
  applyEditorAIPatch,
  createEditorAIRequest,
  type EditorAIPatchResult,
} from "@/features/agent-editor/services/editor-ai-context";
import { FloatingMenuLayer } from "./floating-menu-layer";

type AIStatus = "input" | "loading" | "result" | "error" | "empty";

interface AIFloatingPanelProps {
  editor: Editor;
  onClose: (payload: AIPanelClosePayload) => void;
}

export interface AIPanelClosePayload {
  reason: "cancel" | "replace" | "selection-lost";
  caretPos?: number;
}

/**
 * 独立的 AI 浮动面板组件
 * 使用 Floating UI 定位到选区位置，独立于 BubbleMenu
 */
export function AIFloatingPanel({ editor, onClose }: AIFloatingPanelProps) {
  const [status, setStatus] = useState<AIStatus>("input");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [transactionVersion, setTransactionVersion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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
  const handleSubmit = useCallback(async () => {
    if (isLoading || !selectionRange) return;

    setErrorMessage(null);
    setStatus("loading");
    setIsLoading(true);

    const bundle = createEditorAIRequest(editor, inputValue);
    if (!bundle) {
      setErrorMessage("请先选择需要处理的文本。");
      setStatus("error");
      setIsLoading(false);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle.request),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      if (!response.body) throw new Error("No response body");

      let patch: EditorAIPatchResult | null = null;
      const parser = createParser({
        onEvent: (event) => {
          if (event.data === "[DONE]") return;
          const parsed = JSON.parse(event.data) as {
            type?: string;
            patch?: EditorAIPatchResult;
          };
          if (parsed.type === "patch" && parsed.patch) {
            patch = parsed.patch;
          }
        },
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }

      if (!patch) {
        setStatus("empty");
        return;
      }

      const result = applyEditorAIPatch(editor, patch);
      if (result.status === "stale") {
        setErrorMessage(result.reason);
        setStatus("error");
        return;
      }

      onClose({ reason: "cancel" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("AI patch error:", error);
      const message =
        error instanceof Error ? error.message : "生成失败，请重试。";
      setErrorMessage(message || "生成失败，请重试。");
      setStatus("error");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [editor, inputValue, isLoading, onClose, selectionRange]);

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
    status === "empty" ? "is-empty" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const resultContent =
    status === "loading"
      ? "正在生成..."
      : status === "result"
        ? "已生成修改建议。"
        : status === "error"
          ? errorMessage || "生成失败，请重试。"
          : status === "empty"
            ? "未生成可替换文本，请调整指令后重试。"
            : "";

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
        onChange={(e) => setInputValue(e.target.value)}
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
          disabled={isLoading || !selectionRange}
        >
          {isLoading ? (
            <Loader2 size={14} className="ai-panel-loading" />
          ) : (
            <ArrowRight size={14} />
          )}
        </button>
      </div>
    </FloatingMenuLayer>
  );
}
