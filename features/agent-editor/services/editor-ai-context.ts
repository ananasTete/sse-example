import type { Editor } from "@tiptap/react";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { nanoid } from "nanoid";
import { getAISelectionRange } from "@/features/rich-editor/extensions/ai-selection-highlight";

export interface EditorAIRequest {
  requestId: string;
  message: string;
  selection: {
    contentWithSelection: string;
  };
}

export interface EditorAIPatchResult {
  requestId: string;
  oldText: string;
  newText: string;
}

export interface EditorAIBlockSnapshot {
  blockFrom: number;
  blockTo: number;
  blockText: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

export interface EditorAIPendingSnapshot {
  requestId: string;
  oldText: string;
  blocks: EditorAIBlockSnapshot[];
}

export interface EditorAIRequestBundle {
  request: EditorAIRequest;
  snapshot: EditorAIPendingSnapshot;
}

export type ApplyEditorAIPatchResult =
  | { status: "applied"; inserted: number }
  | { status: "stale"; reason: string };

const pendingSnapshots = new Map<string, EditorAIPendingSnapshot>();

export const editorAIPendingRegistry = {
  set(snapshot: EditorAIPendingSnapshot) {
    pendingSnapshots.set(snapshot.requestId, snapshot);
  },
  get(requestId: string) {
    return pendingSnapshots.get(requestId) ?? null;
  },
  delete(requestId: string) {
    pendingSnapshots.delete(requestId);
  },
};

function serializeDocContent(doc: ProseMirrorNode) {
  const serializer = DOMSerializer.fromSchema(doc.type.schema);
  const container = document.createElement("div");
  container.appendChild(serializer.serializeFragment(doc.content));
  return container.innerHTML;
}

function getBlockText(node: ProseMirrorNode) {
  return node.textBetween(0, node.content.size, "\n\n");
}

function collectSelectionBlocks(
  editor: Editor,
  from: number,
  to: number,
): EditorAIBlockSnapshot[] {
  const blocks: EditorAIBlockSnapshot[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    const contentFrom = pos + 1;
    const contentTo = contentFrom + node.content.size;
    const selectedFrom = Math.max(from, contentFrom);
    const selectedTo = Math.min(to, contentTo);

    if (selectedFrom >= selectedTo) return true;

    const startOffset = selectedFrom - contentFrom;
    const endOffset = selectedTo - contentFrom;
    const selectedText = node.textBetween(startOffset, endOffset, "\n\n");

    if (!selectedText) return true;

    blocks.push({
      blockFrom: pos,
      blockTo: pos + node.nodeSize,
      blockText: getBlockText(node),
      selectedText,
      startOffset,
      endOffset,
    });

    return true;
  });

  return blocks;
}

export function createEditorAIRequest(
  editor: Editor,
  message: string,
): EditorAIRequestBundle | null {
  const range = getAISelectionRange(editor.state) ?? editor.state.selection;
  if (!range || range.from >= range.to) return null;

  const oldText = editor.state.doc.textBetween(range.from, range.to, "\n\n");
  if (!oldText.trim()) return null;

  const referenceMark = editor.state.schema.marks.aiSelectionReference;
  if (!referenceMark) {
    throw new Error("aiSelectionReference mark is not registered");
  }

  const tr = editor.state.tr.addMark(
    range.from,
    range.to,
    referenceMark.create(),
  );
  const requestId = nanoid();
  const snapshot: EditorAIPendingSnapshot = {
    requestId,
    oldText,
    blocks: collectSelectionBlocks(editor, range.from, range.to),
  };

  if (snapshot.blocks.length === 0) return null;

  const request: EditorAIRequest = {
    requestId,
    message,
    selection: {
      contentWithSelection: serializeDocContent(tr.doc),
    },
  };

  editorAIPendingRegistry.set(snapshot);

  return { request, snapshot };
}

interface LocatedBlock extends EditorAIBlockSnapshot {
  blockFrom: number;
  blockTo: number;
}

function collectCurrentTextblocks(editor: Editor): LocatedBlock[] {
  const blocks: LocatedBlock[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    blocks.push({
      blockFrom: pos,
      blockTo: pos + node.nodeSize,
      blockText: getBlockText(node),
      selectedText: getBlockText(node),
      startOffset: 0,
      endOffset: node.content.size,
    });

    return true;
  });

  return blocks;
}

function isSnapshotStillAtHint(editor: Editor, snapshot: EditorAIPendingSnapshot) {
  return snapshot.blocks.every((block) => {
    const node = editor.state.doc.nodeAt(block.blockFrom);
    return Boolean(node?.isTextblock && getBlockText(node) === block.blockText);
  });
}

function findByOriginalBlockText(
  editor: Editor,
  snapshot: EditorAIPendingSnapshot,
): LocatedBlock[] | null {
  const currentBlocks = collectCurrentTextblocks(editor);
  const blockCount = snapshot.blocks.length;

  for (let start = 0; start <= currentBlocks.length - blockCount; start += 1) {
    const candidate = currentBlocks.slice(start, start + blockCount);
    const matches = candidate.every(
      (block, index) => block.blockText === snapshot.blocks[index].blockText,
    );

    if (matches) {
      return candidate.map((block, index) => ({
        ...snapshot.blocks[index],
        blockFrom: block.blockFrom,
        blockTo: block.blockTo,
      }));
    }
  }

  return null;
}

function findBySelectedText(
  editor: Editor,
  snapshot: EditorAIPendingSnapshot,
): LocatedBlock[] | null {
  if (snapshot.blocks.length !== 1) return null;

  const [snapshotBlock] = snapshot.blocks;
  const currentBlocks = collectCurrentTextblocks(editor);

  for (const block of currentBlocks) {
    const startOffset = block.blockText.indexOf(snapshotBlock.selectedText);
    if (startOffset === -1) continue;

    return [
      {
        ...snapshotBlock,
        blockFrom: block.blockFrom,
        blockTo: block.blockTo,
        blockText: block.blockText,
        startOffset,
        endOffset: startOffset + snapshotBlock.selectedText.length,
      },
    ];
  }

  return null;
}

function locateBlocks(
  editor: Editor,
  snapshot: EditorAIPendingSnapshot,
): LocatedBlock[] | null {
  if (isSnapshotStillAtHint(editor, snapshot)) {
    return snapshot.blocks;
  }

  return (
    findByOriginalBlockText(editor, snapshot) ??
    findBySelectedText(editor, snapshot)
  );
}

function splitParagraphText(text: string) {
  return text.split(/\n{2,}/);
}

function buildFullBlockText(block: LocatedBlock, selectedText: string) {
  const before = block.blockText.slice(0, block.startOffset);
  const after = block.blockText.slice(block.endOffset);
  return `${before}${selectedText}${after}`;
}

function insertDiffBlocks(
  editor: Editor,
  requestId: string,
  blocks: LocatedBlock[],
  selectedNewText: string,
) {
  const newSegments = splitParagraphText(selectedNewText);

  if (newSegments.length === blocks.length) {
    const inserts = blocks
      .map((block, index) => ({
        block,
        newText: buildFullBlockText(block, newSegments[index]),
        suggestionId: `${requestId}-${index}`,
      }))
      .filter((item) => item.newText !== item.block.blockText)
      .sort((a, b) => b.block.blockFrom - a.block.blockFrom);

    inserts.forEach(({ block, newText, suggestionId }) => {
      editor.commands.insertParagraphDiffBlock(
        block.blockFrom,
        block.blockTo,
        block.blockText,
        newText,
        suggestionId,
      );
    });

    return inserts.length;
  }

  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];
  const originalText = blocks.map((block) => block.blockText).join("\n\n");
  const before = firstBlock.blockText.slice(0, firstBlock.startOffset);
  const after = lastBlock.blockText.slice(lastBlock.endOffset);
  const newText = `${before}${selectedNewText}${after}`;

  if (newText === originalText) return 0;

  editor.commands.insertParagraphDiffBlock(
    firstBlock.blockFrom,
    lastBlock.blockTo,
    originalText,
    newText,
    `${requestId}-0`,
  );

  return 1;
}

export function applyEditorAIPatch(
  editor: Editor,
  patch: EditorAIPatchResult,
): ApplyEditorAIPatchResult {
  const snapshot = editorAIPendingRegistry.get(patch.requestId);
  if (!snapshot) {
    return { status: "stale", reason: "缺少运行时选区快照，请重新选择后生成。" };
  }

  const blocks = locateBlocks(editor, snapshot);
  if (!blocks) {
    editorAIPendingRegistry.delete(patch.requestId);
    return { status: "stale", reason: "原文已变化，请重新选择后生成。" };
  }

  const inserted = insertDiffBlocks(editor, patch.requestId, blocks, patch.newText);
  editorAIPendingRegistry.delete(patch.requestId);

  return { status: "applied", inserted };
}
