import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface AISelectionHighlightStorage {
  from: number | null;
  to: number | null;
}

export const AISelectionHighlightPluginKey = new PluginKey(
  "aiSelectionHighlight"
);

export const AISelectionHighlight = Extension.create<
  Record<string, never>,
  AISelectionHighlightStorage
>({
  name: "aiSelectionHighlight",

  addStorage() {
    return {
      from: null,
      to: null,
    };
  },

  addCommands() {
    return {
      setAISelectionHighlight:
        (from: number, to: number) =>
        ({ editor }) => {
          // 更新存储
          this.storage.from = from;
          this.storage.to = to;
          // Force a state update to trigger decoration
          editor.view.dispatch(
            editor.state.tr.setMeta(AISelectionHighlightPluginKey, { from, to })
          );
          return true;
        },
      clearAISelectionHighlight:
        () =>
        ({ editor }) => {
          // 清除存储
          this.storage.from = null;
          this.storage.to = null;
          // Force a state update to clear decoration
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
    const extensionStorage = this.storage;

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
            // Map decorations through document changes
            if (
              tr.docChanged &&
              extensionStorage.from !== null &&
              extensionStorage.to !== null
            ) {
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
