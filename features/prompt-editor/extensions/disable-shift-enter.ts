import { Extension } from "@tiptap/core";

export const DisableShiftEnter = Extension.create({
  name: "disableShiftEnter",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => true,
    };
  },
});
