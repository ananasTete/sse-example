"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { SelectionInfo } from "../types";

// ============================================================
// Context 1: Selection（动态，选区变化时更新）
// ============================================================

const EditorAgentSelectionContext = createContext<SelectionInfo | null>(null);

/**
 * 读取当前 AI 选区信息
 * 消费者：ContextBar、任何需要显示选区状态的组件
 */
export function useEditorAgentSelection(): SelectionInfo | null {
  return useContext(EditorAgentSelectionContext);
}

// ============================================================
// Context 2: Actions（静态，引用稳定）
// ============================================================

interface EditorAgentActions {
  /** 从 BubbleMenu / 快捷操作触发 Chat 发送 */
  submit: (prompt: string) => boolean;
  /** 清除选区高亮，回到全文模式 */
  clearSelection: () => void;
}

const EditorAgentActionsContext = createContext<EditorAgentActions | null>(null);

/**
 * 读取 editor-agent 的操作方法
 * 消费者：BubbleMenu、AIFloatingPanel、快捷操作按钮
 */
export function useEditorAgentActions(): EditorAgentActions {
  const ctx = useContext(EditorAgentActionsContext);
  if (!ctx) {
    throw new Error(
      "useEditorAgentActions must be used within EditorAgentProvider",
    );
  }
  return ctx;
}

// ============================================================
// Provider
// ============================================================

interface EditorAgentProviderProps {
  selectionInfo: SelectionInfo | null;
  actions: EditorAgentActions;
  children: ReactNode;
}

/**
 * 提供 editor-agent 交互层的 Context
 *
 * 拆成两个 Context 避免性能问题：
 * - SelectionContext 随选区变化频繁更新，只有 ContextBar 等需要显示选区的组件订阅
 * - ActionsContext 引用稳定（useCallback），BubbleMenu 等订阅后不会因选区变化 re-render
 */
export function EditorAgentProvider({
  selectionInfo,
  actions,
  children,
}: EditorAgentProviderProps) {
  return (
    <EditorAgentActionsContext.Provider value={actions}>
      <EditorAgentSelectionContext.Provider value={selectionInfo}>
        {children}
      </EditorAgentSelectionContext.Provider>
    </EditorAgentActionsContext.Provider>
  );
}
