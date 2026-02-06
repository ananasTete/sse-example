import { Extension } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  type EditorState,
  TextSelection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SlashCommandPluginState {
  isOpen: boolean;
  slashFrom: number | null;
}

export type SlashCommandMeta =
  | { type: "open"; slashFrom: number }
  | { type: "close" };

export const SlashCommandPluginKey = new PluginKey<SlashCommandPluginState>(
  "slashCommand"
);

function shouldTriggerSlash(state: EditorState, insertPos: number) {
  const { selection } = state;
  if (!selection?.empty) return false;

  const $from = selection.$from;
  const parent = $from.parent;
  if (!parent?.isTextblock) return false;
  if (parent.type?.spec?.code) return false;

  // Only at start of the current textblock OR after whitespace.
  if ($from.parentOffset === 0) return true;

  const prevChar = state.doc.textBetween(
    insertPos - 1,
    insertPos,
    "\0",
    "\0"
  );
  return /\s/.test(prevChar);
}

function isSlashStillValid(state: EditorState, slashFrom: number) {
  if (slashFrom < 1 || slashFrom > state.doc.content.size) return false;

  const charAtSlash = state.doc.textBetween(
    slashFrom,
    slashFrom + 1,
    "\0",
    "\0"
  );
  if (charAtSlash !== "/") return false;

  const $slash = state.doc.resolve(slashFrom);
  const blockStart = $slash.start($slash.depth);
  const blockEnd = $slash.end($slash.depth);

  const { selection } = state;
  if (!selection?.empty) return false;
  if (selection.from < slashFrom + 1) return false;
  if (selection.from < blockStart || selection.from > blockEnd) return false;

  // Close if user somehow lands in a code block after opening.
  if (selection.$from?.parent?.type?.spec?.code) return false;

  return true;
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      new Plugin<SlashCommandPluginState>({
        key: SlashCommandPluginKey,
        state: {
          init() {
            return { isOpen: false, slashFrom: null };
          },
          apply(tr, prev, _oldState, nextState) {
            const meta = tr.getMeta(SlashCommandPluginKey) as
              | SlashCommandMeta
              | undefined;

            if (meta?.type === "open") {
              return { isOpen: true, slashFrom: meta.slashFrom };
            }
            if (meta?.type === "close") {
              return { isOpen: false, slashFrom: null };
            }

            if (!prev.isOpen || prev.slashFrom == null) return prev;

            const mapped = tr.mapping.mapResult(prev.slashFrom);
            if (mapped.deleted) return { isOpen: false, slashFrom: null };

            const nextSlashFrom = mapped.pos;
            if (!isSlashStillValid(nextState, nextSlashFrom)) {
              return { isOpen: false, slashFrom: null };
            }

            return { isOpen: true, slashFrom: nextSlashFrom };
          },
        },
        props: {
          handleTextInput(view, from, to, text) {
            const state: EditorState = view.state;
            const pluginState = SlashCommandPluginKey.getState(state);
            if (pluginState?.isOpen) return false;

            if (text !== "/") return false;
            if (!shouldTriggerSlash(state, from)) return false;

            const tr = state.tr.insertText(text, from, to);
            tr.setMeta(SlashCommandPluginKey, { type: "open", slashFrom: from });
            tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
            view.dispatch(tr);
            return true;
          },
          decorations(state) {
            const pluginState = SlashCommandPluginKey.getState(state);
            if (!pluginState?.isOpen || pluginState.slashFrom == null) {
              return null;
            }

            const from = pluginState.slashFrom;
            const to = state.selection.from;
            if (to <= from) return null;

            const decoration = Decoration.inline(from, to, {
              class: "slash-command-pill",
            });
            return DecorationSet.create(state.doc, [decoration]);
          },
        },
      }),
    ];
  },
});
