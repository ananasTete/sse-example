"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
} from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";

// ============ 类型定义 ============

export interface InlineDiffOptions {
  onAccept?: (suggestionId: string) => void;
  onReject?: (suggestionId: string) => void;
}

export interface InlineDiffStorage {
  onAccept?: (suggestionId: string) => void;
  onReject?: (suggestionId: string) => void;
}

export interface InlineDiffAttributes {
  suggestionId: string;
  newText: string;
  status: "pending" | "accepted" | "rejected";
}

// ============ React NodeView 组件 ============

function InlineDiffView({ node, editor, extension }: NodeViewProps) {
  const { suggestionId, newText, status } =
    node.attrs as InlineDiffAttributes;

  const handleAccept = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 先执行接受命令
    editor.commands.acceptDiff(suggestionId);
    // 然后通知外部
    (extension.storage as InlineDiffStorage).onAccept?.(suggestionId);
  };

  const handleReject = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 先执行拒绝命令
    editor.commands.rejectDiff(suggestionId);
    // 然后通知外部
    (extension.storage as InlineDiffStorage).onReject?.(suggestionId);
  };

  // 已处理状态不显示按钮
  if (status !== "pending") {
    return (
      <NodeViewWrapper as="span" className="inline-diff-resolved">
        <NodeViewContent as="span" />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="inline-diff-wrapper">
      {/* 原文：删除线 + 红色 */}
      <span className="inline-diff-deleted">
        <NodeViewContent as="span" />
      </span>

      {/* 新文本：绿色 */}
      <span className="inline-diff-added">{newText}</span>

      {/* 操作按钮 */}
      <span className="inline-diff-actions" contentEditable={false}>
        <button
          className="inline-diff-btn inline-diff-accept"
          onClick={handleAccept}
          title="接受修改"
        >
          ✓
        </button>
        <button
          className="inline-diff-btn inline-diff-reject"
          onClick={handleReject}
          title="拒绝修改"
        >
          ✗
        </button>
      </span>
    </NodeViewWrapper>
  );
}

// ============ TipTap Node Extension ============

export const InlineDiff = Node.create<InlineDiffOptions, InlineDiffStorage>({
  name: "inlineDiff",

  group: "inline",
  inline: true,
  content: "text*",

  // 不允许在 diff 节点内部编辑
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      onAccept: undefined,
      onReject: undefined,
    };
  },

  addStorage() {
    return {
      onAccept: this.options.onAccept,
      onReject: this.options.onReject,
    };
  },

  addAttributes() {
    return {
      suggestionId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-suggestion-id"),
        renderHTML: (attributes) => ({
          "data-suggestion-id": attributes.suggestionId,
        }),
      },
      newText: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-new-text"),
        renderHTML: (attributes) => ({
          "data-new-text": attributes.newText,
        }),
      },
      status: {
        default: "pending",
        parseHTML: (element) =>
          element.getAttribute("data-status") || "pending",
        renderHTML: (attributes) => ({
          "data-status": attributes.status,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-diff"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "inline-diff" }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineDiffView);
  },

  addCommands() {
    return {
      // 插入 diff 节点：将 from-to 范围的文本替换为 diff 节点
      insertDiffNode:
        (from: number, to: number, newText: string, suggestionId: string) =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            // 获取原文
            const originalText = state.doc.textBetween(from, to);

            // 创建 diff 节点，包含原文作为内容
            const diffNode = this.type.create(
              { suggestionId, newText, status: "pending" },
              state.schema.text(originalText),
            );

            // 替换原文为 diff 节点
            tr.replaceWith(from, to, diffNode);
          }
          return true;
        },

      // 接受修改：用 newText 替换整个节点
      acceptDiff:
        (suggestionId: string) =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            let found = false;
            state.doc.descendants((node, pos) => {
              if (found) return false;
              if (
                node.type.name === "inlineDiff" &&
                node.attrs.suggestionId === suggestionId
              ) {
                const newText = node.attrs.newText as string;
                // 用纯文本替换节点
                tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(newText));
                found = true;
                return false;
              }
              return true;
            });
          }
          return true;
        },

      // 拒绝修改：恢复原文（节点内容）
      rejectDiff:
        (suggestionId: string) =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            let found = false;
            state.doc.descendants((node, pos) => {
              if (found) return false;
              if (
                node.type.name === "inlineDiff" &&
                node.attrs.suggestionId === suggestionId
              ) {
                // 获取节点内的原文
                const originalText = node.textContent;
                // 用原文替换节点
                tr.replaceWith(
                  pos,
                  pos + node.nodeSize,
                  state.schema.text(originalText),
                );
                found = true;
                return false;
              }
              return true;
            });
          }
          return true;
        },

      // 清除所有 diff 节点（恢复原文）
      clearAllDiffs:
        () =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            // 从后向前遍历，避免位置偏移
            const positions: { pos: number; node: typeof state.doc }[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name === "inlineDiff") {
                positions.push({ pos, node: node as typeof state.doc });
              }
              return true;
            });

            // 反向处理
            positions.reverse().forEach(({ pos, node }) => {
              const originalText = node.textContent;
              tr.replaceWith(
                pos,
                pos + node.nodeSize,
                state.schema.text(originalText),
              );
            });
          }
          return true;
        },

      // 接受所有 diff
      acceptAllDiffs:
        () =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            const positions: { pos: number; node: typeof state.doc }[] = [];
            state.doc.descendants((node, pos) => {
              if (
                node.type.name === "inlineDiff" &&
                node.attrs.status === "pending"
              ) {
                positions.push({ pos, node: node as typeof state.doc });
              }
              return true;
            });

            positions.reverse().forEach(({ pos, node }) => {
              const newText = node.attrs.newText as string;
              tr.replaceWith(pos, pos + node.nodeSize, state.schema.text(newText));
            });
          }
          return true;
        },
    };
  },
});

// ============ 类型声明扩展 ============

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineDiff: {
      insertDiffNode: (
        from: number,
        to: number,
        newText: string,
        suggestionId: string,
      ) => ReturnType;
      acceptDiff: (suggestionId: string) => ReturnType;
      rejectDiff: (suggestionId: string) => ReturnType;
      clearAllDiffs: () => ReturnType;
      acceptAllDiffs: () => ReturnType;
    };
  }
}
