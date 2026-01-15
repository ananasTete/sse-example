import type { Editor } from "@tiptap/react";

// 交互模式
export type EditorMode = "fulltext" | "selection";

// 选区信息
export interface SelectionInfo {
  from: number;
  to: number;
  text: string;
}

// 聊天上下文（发送给 AI 的结构化数据）
export interface ChatContext {
  mode: EditorMode;
  content: string; // 全文模式下是全文，选中模式下是选中内容
  selection?: SelectionInfo; // 选中模式下的选区信息
}

// 建议状态：idle(初始) -> checked(已选择) | canceled(已取消/失效) | failed(应用失败)
export type SuggestionStatus = "idle" | "checked" | "canceled" | "failed";

// 建议类型
export type SuggestionType = "rewrite" | "edit";

// 单个建议项（存储在 ToolCallPart.input 中）
export interface SuggestionItem {
  label?: string;
  originalText?: string; // edit 类型需要，rewrite 类型可选
  newText: string;
  status: SuggestionStatus;
}

// 建议工具的统一 input 类型
// suggest_rewrite 和 suggest_edit 都使用相同结构
export interface SuggestionToolInput {
  suggestions: SuggestionItem[];
}

// 渲染用的建议（从 part.input 解析出来）
export interface Suggestion {
  id: string; // toolCallId-index
  type: SuggestionType;
  index: number; // 在数组中的索引，用于更新状态
  label?: string;
  originalText?: string;
  newText: string;
  position?: { from: number; to: number };
  status: SuggestionStatus;
}

// useEditorAgent 选项
export interface UseEditorAgentOptions {
  editor: Editor | null;
}

// useEditorAgent 返回值
export interface UseEditorAgentReturn {
  mode: EditorMode;
  selectionInfo: SelectionInfo | null;
  activateSelectionMode: () => boolean;
  clearSelectionMode: () => void;
  replaceSelection: (newText: string) => boolean;
  replaceAt: (from: number, to: number, newText: string) => boolean;
  replaceText: (originalText: string, newText: string) => boolean;
  scrollToPosition: (from: number) => void;
  getContext: () => ChatContext;
}

// 快捷操作类型
export type QuickAction = "optimize" | "continue" | "expand" | "explain";

// 快捷操作配置
export const QUICK_ACTIONS: {
  key: QuickAction;
  label: string;
  prompt: string;
}[] = [
  {
    key: "optimize",
    label: "优化",
    prompt: "请优化这段文字，使其更加简洁流畅",
  },
  { key: "continue", label: "续写", prompt: "请根据上下文续写这段内容" },
  { key: "expand", label: "扩写", prompt: "请扩展这段内容，增加更多细节" },
  { key: "explain", label: "解释", prompt: "请解释这段内容的含义" },
];

// ============ 配置常量 ============

/** API 端点 */
export const AGENT_EDITOR_API = "/api/agent-editor";

/** 默认模型 */
export const DEFAULT_MODEL = "gpt-4";

/** 聊天 ID */
export const CHAT_ID = "agent-editor";

/** 选中文本截断长度 */
export const SELECTION_TRUNCATE_LENGTH = 20;

// ============ 类型守卫函数 ============

/**
 * 判断是否是 SuggestionItem
 */
function isSuggestionItem(item: unknown): item is SuggestionItem {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.newText === "string" &&
    (obj.status === "idle" ||
      obj.status === "checked" ||
      obj.status === "canceled" ||
      obj.status === "failed")
  );
}

/**
 * 判断是否是 SuggestionToolInput（统一的建议工具输入类型）
 */
export function isSuggestionToolInput(
  input: unknown,
): input is SuggestionToolInput {
  if (typeof input !== "object" || input === null) return false;
  const obj = input as Record<string, unknown>;
  return (
    Array.isArray(obj.suggestions) && obj.suggestions.every(isSuggestionItem)
  );
}
