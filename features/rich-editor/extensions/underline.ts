import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Minimal Underline mark extension.
 * We implement it locally to avoid adding an extra dependency.
 */
export const Underline = Mark.create({
  name: "underline",

  parseHTML() {
    return [
      { tag: "u" },
      { style: "text-decoration=underline" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["u", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setUnderline:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleUnderline:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetUnderline:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    underline: {
      setUnderline: () => ReturnType;
      toggleUnderline: () => ReturnType;
      unsetUnderline: () => ReturnType;
    };
  }
}

