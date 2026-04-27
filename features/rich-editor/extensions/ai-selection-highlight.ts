import { Extension } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type AISelectionRange = { from: number; to: number } | null;

export const AISelectionHighlightPluginKey = new PluginKey(
  "aiSelectionHighlight"
);

export function getAISelectionRange(state: EditorState): AISelectionRange {
  return AISelectionHighlightPluginKey.getState(state) ?? null;
}

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
      new Plugin<AISelectionRange>({
        key: AISelectionHighlightPluginKey,
        state: {
          init() {
            return null;
          },
          apply(tr, range) {
            if (tr.docChanged) {
              return null;
            }

            const meta = tr.getMeta(AISelectionHighlightPluginKey);
            if (meta) {
              if (meta.from !== null && meta.to !== null) {
                return { from: meta.from, to: meta.to };
              }
              return null;
            }

            return range;
          },
        },
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              const range = getAISelectionRange(view.state);
              if (!range) return false;

              event.preventDefault();

              view.dispatch(
                view.state.tr
                  .setMeta(AISelectionHighlightPluginKey, {
                    from: null,
                    to: null,
                  })
                  .setSelection(TextSelection.create(view.state.doc, range.to))
                  .scrollIntoView()
              );
              view.focus();

              return true;
            },
          },
          decorations(state) {
            const range = this.getState(state);
            if (!range) return DecorationSet.empty;

            const decoration = Decoration.inline(range.from, range.to, {
              class: "ai-selection-highlight",
            });

            return DecorationSet.create(state.doc, [decoration]);
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
