import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { getAISelectionRange } from "@/features/rich-editor/extensions/ai-selection-highlight";
import type { DocumentSelectionReference } from "../chat/types";

function selectionBoundaryText(
  leaf: ProseMirrorNode,
  startBoundary: ProseMirrorNode["type"],
  endBoundary: ProseMirrorNode["type"],
) {
  if (leaf.type === startBoundary) return "<selection>";
  if (leaf.type === endBoundary) return "</selection>";
  return "";
}

export function buildDocumentSelectionReference(
  editor: Editor,
  originId = "document",
): DocumentSelectionReference | null {
  const range = getAISelectionRange(editor.state);
  if (!range || range.from >= range.to) return null;

  const selectedText = editor.state.doc.textBetween(range.from, range.to, "\n");
  if (!selectedText.trim()) return null;

  const startBoundary = editor.state.schema.nodes.selectionStartBoundary;
  const endBoundary = editor.state.schema.nodes.selectionEndBoundary;
  if (!startBoundary || !endBoundary) {
    throw new Error("selection boundary nodes are not registered");
  }

  const tr = editor.state.tr
    .insert(range.to, endBoundary.create())
    .insert(range.from, startBoundary.create());

  return {
    type: "selection",
    content_with_selection: tr.doc.textBetween(
      0,
      tr.doc.content.size,
      "\n",
      (leaf) => selectionBoundaryText(leaf, startBoundary, endBoundary),
    ),
    is_full_content: true,
    origin_id: originId,
    origin_type: "document",
  };
}
