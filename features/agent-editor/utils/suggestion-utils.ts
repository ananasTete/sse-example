/**
 * 建议状态更新工具函数
 * 提供 updater 工厂函数，用于 updateMessageParts
 */

import type { MessagePart, ToolCallPart } from "@/features/ai-sdk/hooks/use-chat/types";
import {
  isSuggestRewriteInput,
  isSuggestEditInput,
  type SuggestionStatus,
} from "../types";

// 工具名称常量
const SUGGEST_REWRITE = "suggest_rewrite";
const SUGGEST_EDIT = "suggest_edit";

/**
 * 判断是否是建议类工具
 */
function isSuggestionTool(toolName: string): boolean {
  return toolName === SUGGEST_REWRITE || toolName === SUGGEST_EDIT;
}

/**
 * 创建取消所有建议的 updater
 * 将所有 idle 状态的建议设为 canceled
 */
export function createCancelAllUpdater(): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    parts.map((part) => {
      if (part.type !== "tool-call") return part;
      if (!isSuggestionTool(part.toolName)) return part;
      if (!part.input) return part;

      const toolPart = part as ToolCallPart;

      if (toolPart.toolName === SUGGEST_REWRITE && isSuggestRewriteInput(toolPart.input)) {
        return {
          ...toolPart,
          input: {
            ...toolPart.input,
            suggestions: toolPart.input.suggestions.map((s) => ({
              ...s,
              status: s.status === "idle" ? ("canceled" as SuggestionStatus) : s.status,
            })),
          },
        };
      }

      if (toolPart.toolName === SUGGEST_EDIT && isSuggestEditInput(toolPart.input)) {
        return {
          ...toolPart,
          input: {
            ...toolPart.input,
            edit: {
              ...toolPart.input.edit,
              status: toolPart.input.edit.status === "idle" ? ("canceled" as SuggestionStatus) : toolPart.input.edit.status,
            },
          },
        };
      }

      return part;
    });
}

/**
 * 创建应用建议的 updater
 * @param toolCallId - 工具调用 ID
 * @param index - 建议索引（用于 suggest_rewrite 的多选一）
 */
export function createApplySuggestionUpdater(
  toolCallId: string,
  index: number
): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    parts.map((part) => {
      if (part.type !== "tool-call" || part.toolCallId !== toolCallId) {
        return part;
      }

      const toolPart = part as ToolCallPart;

      if (toolPart.toolName === SUGGEST_REWRITE && isSuggestRewriteInput(toolPart.input)) {
        // suggest_rewrite: 选中的设为 checked，其他 idle 的设为 canceled
        return {
          ...toolPart,
          input: {
            ...toolPart.input,
            suggestions: toolPart.input.suggestions.map((s, i) => ({
              ...s,
              status:
                i === index
                  ? ("checked" as SuggestionStatus)
                  : s.status === "idle"
                    ? ("canceled" as SuggestionStatus)
                    : s.status,
            })),
          },
        };
      }

      if (toolPart.toolName === SUGGEST_EDIT && isSuggestEditInput(toolPart.input)) {
        // suggest_edit: 单个 edit，直接设为 checked
        return {
          ...toolPart,
          input: {
            ...toolPart.input,
            edit: {
              ...toolPart.input.edit,
              status: "checked" as SuggestionStatus,
            },
          },
        };
      }

      return part;
    });
}

/**
 * 创建标记建议为失败状态的 updater
 * @param toolCallId - 工具调用 ID
 * @param index - 建议索引
 */
export function createFailSuggestionUpdater(
  toolCallId: string,
  index: number
): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    parts.map((part) => {
      if (part.type !== "tool-call" || part.toolCallId !== toolCallId) {
        return part;
      }

      const toolPart = part as ToolCallPart;

      if (toolPart.toolName === SUGGEST_REWRITE && isSuggestRewriteInput(toolPart.input)) {
        return {
          ...toolPart,
          input: {
            ...toolPart.input,
            suggestions: toolPart.input.suggestions.map((s, i) => ({
              ...s,
              status: i === index ? ("failed" as SuggestionStatus) : s.status,
            })),
          },
        };
      }

      if (toolPart.toolName === SUGGEST_EDIT && isSuggestEditInput(toolPart.input)) {
        return {
          ...toolPart,
          input: {
            ...toolPart.input,
            edit: {
              ...toolPart.input.edit,
              status: "failed" as SuggestionStatus,
            },
          },
        };
      }

      return part;
    });
}
