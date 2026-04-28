import { Node } from "@tiptap/core";

export const SELECTION_START_TAG = "selection-start";
export const SELECTION_END_TAG = "selection-end";

function createSelectionBoundaryNode(name: string, tag: string) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: false,

    parseHTML() {
      return [{ tag }];
    },

    renderHTML() {
      return [tag];
    },
  });
}

export const SelectionStartBoundary = createSelectionBoundaryNode(
  "selectionStartBoundary",
  SELECTION_START_TAG,
);

export const SelectionEndBoundary = createSelectionBoundaryNode(
  "selectionEndBoundary",
  SELECTION_END_TAG,
);
