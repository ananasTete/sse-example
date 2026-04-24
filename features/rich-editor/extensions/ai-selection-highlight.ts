import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const AISelectionHighlightPluginKey = new PluginKey(
  "aiSelectionHighlight"
);

export const AISelectionHighlight = Extension.create<
  Record<string, never>,
  Record<string, never>
>({
  name: "aiSelectionHighlight",

  addCommands() {
    return {
      setAISelectionHighlight:
        (from: number, to: number) =>
        ({ editor }) => {
          editor.view.dispatch(
            editor.state.tr.setMeta(AISelectionHighlightPluginKey, { from, to })
          );
          return true;
        },
      clearAISelectionHighlight:
        () =>
        ({ editor }) => {
          editor.view.dispatch(
            editor.state.tr.setMeta(AISelectionHighlightPluginKey, {
              from: null,
              to: null,
            })
          );
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: AISelectionHighlightPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            const meta = tr.getMeta(AISelectionHighlightPluginKey);
            if (meta) {
              if (meta.from !== null && meta.to !== null) {
                const decoration = Decoration.inline(meta.from, meta.to, {
                  class: "ai-selection-highlight",
                });
                return DecorationSet.create(tr.doc, [decoration]);
              } else {
                return DecorationSet.empty;
              }
            }
            if (tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

// Type augmentation for Tiptap commands
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiSelectionHighlight: {
      setAISelectionHighlight: (from: number, to: number) => ReturnType;
      clearAISelectionHighlight: () => ReturnType;
    };
  }
}
