/**
 * 建议状态更新工具函数
 * 提供 updater 工厂函数，用于 updateMessageParts
 */

import type {
  MessagePart,
  ToolCallPart,
} from "@/features/ai-sdk/hooks/use-chat/types";
import { isSuggestionToolInput, type SuggestionStatus } from "../types";

// 建议类工具名称
const SUGGESTION_TOOLS = ["suggest_rewrite", "suggest_edit"];

/**
 * 判断是否是建议类工具
 */
function isSuggestionTool(toolName: string): boolean {
  return SUGGESTION_TOOLS.includes(toolName);
}

/**
 * 通用的建议状态更新函数
 * @param parts - 消息部分数组
 * @param shouldUpdate - 判断是否需要更新该 part
 * @param getNewStatus - 根据当前状态和索引返回新状态
 */
function updateSuggestionStatus(
  parts: MessagePart[],
  shouldUpdate: (part: ToolCallPart) => boolean,
  getNewStatus: (
    currentStatus: SuggestionStatus,
    index: number,
  ) => SuggestionStatus,
): MessagePart[] {
  return parts.map((part) => {
    if (part.type !== "tool-call") return part;
    if (!isSuggestionTool(part.toolName)) return part;
    if (!isSuggestionToolInput(part.input)) return part;
    if (!shouldUpdate(part)) return part;

    return {
      ...part,
      input: {
        ...part.input,
        suggestions: part.input.suggestions.map((s, i) => ({
          ...s,
          status: getNewStatus(s.status, i),
        })),
      },
    };
  });
}

/**
 * 创建取消所有建议的 updater
 * 将所有 idle 状态的建议设为 canceled
 */
export function createCancelAllUpdater(): (
  parts: MessagePart[],
) => MessagePart[] {
  return (parts) =>
    updateSuggestionStatus(
      parts,
      () => true, // 更新所有建议工具
      (status) => (status === "idle" ? "canceled" : status),
    );
}

/**
 * 创建应用建议的 updater（选区模式，互斥）
 * 将指定建议设为 checked，同一 toolCallId 下的其他 idle 建议设为 canceled
 * @param toolCallId - 工具调用 ID
 * @param index - 建议索引
 */
export function createApplySuggestionUpdater(
  toolCallId: string,
  index: number,
): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    updateSuggestionStatus(
      parts,
      (part) => part.toolCallId === toolCallId,
      (status, i) =>
        i === index ? "checked" : status === "idle" ? "canceled" : status,
    );
}

/**
 * 创建应用单个建议的 updater（全文模式，独立）
 * 只将指定建议设为 checked，不影响其他建议
 * @param toolCallId - 工具调用 ID
 * @param index - 建议索引
 */
export function createCheckSuggestionUpdater(
  toolCallId: string,
  index: number,
): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    updateSuggestionStatus(
      parts,
      (part) => part.toolCallId === toolCallId,
      (status, i) => (i === index ? "checked" : status),
    );
}

/**
 * 创建标记建议为失败状态的 updater
 * @param toolCallId - 工具调用 ID
 * @param index - 建议索引
 */
export function createFailSuggestionUpdater(
  toolCallId: string,
  index: number,
): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    updateSuggestionStatus(
      parts,
      (part) => part.toolCallId === toolCallId,
      (status, i) => (i === index ? "failed" : status),
    );
}

/**
 * 创建取消单个建议的 updater
 * @param toolCallId - 工具调用 ID
 * @param index - 建议索引
 */
export function createCancelSuggestionUpdater(
  toolCallId: string,
  index: number,
): (parts: MessagePart[]) => MessagePart[] {
  return (parts) =>
    updateSuggestionStatus(
      parts,
      (part) => part.toolCallId === toolCallId,
      (status, i) => (i === index ? "canceled" : status),
    );
}
