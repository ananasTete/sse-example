import { Mark, mergeAttributes } from "@tiptap/core";

export const AI_SELECTION_REFERENCE_ATTR = "data-ai-selection";

export const AISelectionReference = Mark.create({
  name: "aiSelectionReference",

  inclusive: false,

  parseHTML() {
    return [{ tag: `span[${AI_SELECTION_REFERENCE_ATTR}="true"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        [AI_SELECTION_REFERENCE_ATTR]: "true",
      }),
      0,
    ];
  },
});
