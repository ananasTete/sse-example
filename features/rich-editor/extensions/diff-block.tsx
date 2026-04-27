"use client";

import { Mark, Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
} from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";

type DiffStatus = "pending" | "accepted" | "rejected";
type DiffChangeType = "added" | "removed";
type MaterializeMode = "accept" | "reject";

export interface DiffBlockOptions {
  onAccept?: (suggestionId: string) => void;
  onReject?: (suggestionId: string) => void;
}

export interface DiffBlockStorage {
  onAccept?: (suggestionId: string) => void;
  onReject?: (suggestionId: string) => void;
}

interface DiffBlockAttributes {
  id: string;
  suggestionId: string;
  status: DiffStatus;
}

function commonPrefixLength(a: string, b: string) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(a: string, b: string, prefixLength: number) {
  let length = 0;
  while (
    length < a.length - prefixLength &&
    length < b.length - prefixLength &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

type DiffSegment =
  | { type: "equal"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string };

function createCharacterDiffSegments(a: string, b: string): DiffSegment[] {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];

  const pushSegment = (type: DiffSegment["type"], text: string) => {
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous?.type === type) {
      previous.text += text;
      return;
    }
    segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushSegment("equal", a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment("removed", a[i]);
      i += 1;
    } else {
      pushSegment("added", b[j]);
      j += 1;
    }
  }

  while (i < a.length) {
    pushSegment("removed", a[i]);
    i += 1;
  }

  while (j < b.length) {
    pushSegment("added", b[j]);
    j += 1;
  }

  return segments;
}

function createDiffParagraph(
  state: { schema: Schema },
  originalText: string,
  newText: string,
) {
  const { schema } = state;
  const paragraph = schema.nodes.paragraph;
  const diffChange = schema.marks.diffChange;
  const content: ProseMirrorNode[] = [];
  const prefixLength = commonPrefixLength(originalText, newText);
  const suffixLength = commonSuffixLength(originalText, newText, prefixLength);
  const prefix = originalText.slice(0, prefixLength);
  const originalMiddle = originalText.slice(
    prefixLength,
    originalText.length - suffixLength,
  );
  const newMiddle = newText.slice(prefixLength, newText.length - suffixLength);
  const suffix = originalText.slice(originalText.length - suffixLength);

  if (prefix) {
    content.push(schema.text(prefix));
  }

  createCharacterDiffSegments(originalMiddle, newMiddle).forEach((segment) => {
    if (segment.type === "equal") {
      content.push(schema.text(segment.text));
      return;
    }

    content.push(
      schema.text(segment.text, [
        diffChange.create({
          changeType: segment.type === "removed" ? "removed" : "added",
        }),
      ]),
    );
  });

  if (suffix) {
    content.push(schema.text(suffix));
  }

  return paragraph.create(null, content);
}

function splitParagraphText(text: string) {
  return text.split(/\n{2,}/);
}

function createDiffBlockContent(
  state: { schema: Schema },
  originalText: string,
  newText: string,
) {
  const originalParagraphs = splitParagraphText(originalText);
  const newParagraphs = splitParagraphText(newText);
  const paragraphCount = Math.max(originalParagraphs.length, newParagraphs.length);
  const paragraphs: ProseMirrorNode[] = [];

  for (let index = 0; index < paragraphCount; index += 1) {
    paragraphs.push(
      createDiffParagraph(
        state,
        originalParagraphs[index] ?? "",
        newParagraphs[index] ?? "",
      ),
    );
  }

  return Fragment.fromArray(paragraphs);
}

function getDiffChangeType(node: ProseMirrorNode): DiffChangeType | null {
  const mark = node.marks.find((item) => item.type.name === "diffChange");
  return (mark?.attrs.changeType as DiffChangeType | undefined) ?? null;
}

function materializeNode(
  node: ProseMirrorNode,
  mode: MaterializeMode,
): ProseMirrorNode | null {
  if (node.isText) {
    const changeType = getDiffChangeType(node);

    if (changeType === "removed" && mode === "accept") return null;
    if (changeType === "added" && mode === "reject") return null;

    const marks = node.marks.filter((mark) => mark.type.name !== "diffChange");
    return node.type.schema.text(node.text ?? "", marks);
  }

  const children: ProseMirrorNode[] = [];
  node.content.forEach((child) => {
    const materialized = materializeNode(child, mode);
    if (materialized) {
      children.push(materialized);
    }
  });

  return node.type.create(node.attrs, Fragment.fromArray(children), node.marks);
}

function materializeDiffBlock(node: ProseMirrorNode, mode: MaterializeMode) {
  const children: ProseMirrorNode[] = [];

  node.content.forEach((child) => {
    const materialized = materializeNode(child, mode);
    if (materialized) {
      children.push(materialized);
    }
  });

  return Fragment.fromArray(children);
}

function createDiffBlockId(suggestionId: string) {
  return `diff-block-${suggestionId}`;
}

function DiffBlockView({ node, editor, extension }: NodeViewProps) {
  const { id, suggestionId, status } = node.attrs as DiffBlockAttributes;

  const handleAccept = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    editor.commands.acceptDiff(suggestionId);
    (extension.storage as DiffBlockStorage).onAccept?.(suggestionId);
  };

  const handleReject = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    editor.commands.rejectDiff(suggestionId);
    (extension.storage as DiffBlockStorage).onReject?.(suggestionId);
  };

  return (
    <NodeViewWrapper
      as="div"
      data-diff-block-id={id}
      className="diff-block-wrapper"
    >
      <div className="diff-block-content">
        <NodeViewContent />
      </div>

      {status === "pending" && (
        <div className="diff-operation-buttons" contentEditable={false}>
          <button
            type="button"
            className="diff-operation-button diff-operation-accept"
            onClick={handleAccept}
            title="接受修改"
          >
            ✓
          </button>
          <button
            type="button"
            className="diff-operation-button diff-operation-reject"
            onClick={handleReject}
            title="拒绝修改"
          >
            ✕
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const DiffChange = Mark.create({
  name: "diffChange",

  addAttributes() {
    return {
      changeType: {
        default: "added",
        parseHTML: (element) =>
          element.getAttribute("diffchangetype") ||
          element.getAttribute("data-diff-change-type") ||
          "added",
        renderHTML: (attributes) => ({
          diffchangetype: attributes.changeType,
          "data-diff-change-type": attributes.changeType,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "diffchange" }];
  },

  renderHTML({ HTMLAttributes }) {
    const changeType = (HTMLAttributes.diffchangetype ||
      HTMLAttributes["data-diff-change-type"]) as DiffChangeType | undefined;
    return [
      "diffchange",
      mergeAttributes(HTMLAttributes, {
        class:
          changeType === "removed"
            ? "diff-change-removed"
            : "diff-change-modified",
      }),
      0,
    ];
  },
});

export const DiffBlock = Node.create<DiffBlockOptions, DiffBlockStorage>({
  name: "diffBlock",

  group: "block",
  content: "block+",
  isolating: true,
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
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-diff-block-id"),
        renderHTML: (attributes) => ({
          "data-diff-block-id": attributes.id,
        }),
      },
      suggestionId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-suggestion-id"),
        renderHTML: (attributes) => ({
          "data-suggestion-id": attributes.suggestionId,
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
      { tag: 'div[data-type="diff-block"]' },
      { tag: "div[data-diff-block-id]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": "diff-block", class: "diff-block-wrapper" },
        HTMLAttributes,
      ),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiffBlockView);
  },

  addCommands() {
    return {
      insertDiffNode:
        (from: number, to: number, newText: string, suggestionId: string) =>
        ({ tr, dispatch, state }) => {
          const originalText = state.doc.textBetween(from, to, "\n\n");
          if (!originalText) return false;

          if (dispatch) {
            const diffNode = this.type.create(
              {
                id: createDiffBlockId(suggestionId),
                suggestionId,
                status: "pending",
              },
              createDiffBlockContent(state, originalText, newText),
            );

            tr.replaceRangeWith(from, to, diffNode).scrollIntoView();
          }
          return true;
        },

      insertParagraphDiffBlock:
        (
          from: number,
          to: number,
          originalText: string,
          newText: string,
          suggestionId: string,
        ) =>
        ({ tr, dispatch, state }) => {
          if (!originalText) return false;

          if (dispatch) {
            const diffNode = this.type.create(
              {
                id: createDiffBlockId(suggestionId),
                suggestionId,
                status: "pending",
              },
              createDiffBlockContent(state, originalText, newText),
            );

            tr.replaceWith(from, to, diffNode).scrollIntoView();
          }

          return true;
        },

      acceptDiff:
        (suggestionId: string) =>
        ({ tr, dispatch, state }) => {
          let found = false;

          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (
              node.type.name === "diffBlock" &&
              node.attrs.suggestionId === suggestionId
            ) {
              if (dispatch) {
                tr.replaceWith(
                  pos,
                  pos + node.nodeSize,
                  materializeDiffBlock(node, "accept"),
                ).scrollIntoView();
              }
              found = true;
              return false;
            }
            return true;
          });

          return found;
        },

      rejectDiff:
        (suggestionId: string) =>
        ({ tr, dispatch, state }) => {
          let found = false;

          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (
              node.type.name === "diffBlock" &&
              node.attrs.suggestionId === suggestionId
            ) {
              if (dispatch) {
                tr.replaceWith(
                  pos,
                  pos + node.nodeSize,
                  materializeDiffBlock(node, "reject"),
                ).scrollIntoView();
              }
              found = true;
              return false;
            }
            return true;
          });

          return found;
        },

      clearAllDiffs:
        () =>
        ({ tr, dispatch, state }) => {
          const positions: { pos: number; node: ProseMirrorNode }[] = [];

          state.doc.descendants((node, pos) => {
            if (node.type.name === "diffBlock") {
              positions.push({ pos, node });
            }
            return true;
          });

          if (dispatch) {
            positions.reverse().forEach(({ pos, node }) => {
              tr.replaceWith(
                pos,
                pos + node.nodeSize,
                materializeDiffBlock(node, "reject"),
              );
            });
          }

          return true;
        },

      acceptAllDiffs:
        () =>
        ({ tr, dispatch, state }) => {
          const positions: { pos: number; node: ProseMirrorNode }[] = [];

          state.doc.descendants((node, pos) => {
            if (
              node.type.name === "diffBlock" &&
              node.attrs.status === "pending"
            ) {
              positions.push({ pos, node });
            }
            return true;
          });

          if (dispatch) {
            positions.reverse().forEach(({ pos, node }) => {
              tr.replaceWith(
                pos,
                pos + node.nodeSize,
                materializeDiffBlock(node, "accept"),
              );
            });
          }

          return true;
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineDiff: {
      insertDiffNode: (
        from: number,
        to: number,
        newText: string,
        suggestionId: string,
      ) => ReturnType;
      insertParagraphDiffBlock: (
        from: number,
        to: number,
        originalText: string,
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
