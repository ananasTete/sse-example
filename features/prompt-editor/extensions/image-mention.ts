"use client";

import { Extension } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { PromptImage } from "../types";

export interface ImageMentionPluginState {
  isOpen: boolean;
  triggerFrom: number | null;
  selectedIndex: number;
}

export interface ImageMentionOptions {
  getImages: () => PromptImage[];
}

export type ImageMentionMeta =
  | { type: "open"; triggerFrom: number }
  | { type: "close" }
  | { type: "setSelectedIndex"; index: number };

export const ImageMentionPluginKey = new PluginKey<ImageMentionPluginState>(
  "imageMention",
);

export interface ReadyPromptImage extends PromptImage {
  status: "ready";
  url: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageMention: {
      closeImageMention: () => ReturnType;
      setImageMentionSelectedIndex: (index: number) => ReturnType;
      insertImageMention: (attrs: {
        imageId: string;
        label: string;
      }) => ReturnType;
    };
  }
}

function getDefaultState(): ImageMentionPluginState {
  return {
    isOpen: false,
    triggerFrom: null,
    selectedIndex: 0,
  };
}

function getReadyImages(images: PromptImage[]): ReadyPromptImage[] {
  return images.filter(
    (image): image is ReadyPromptImage =>
      image.status === "ready" && Boolean(image.url),
  );
}

export function filterImageMentionItems(
  images: PromptImage[],
  query: string,
): ReadyPromptImage[] {
  const readyImages = getReadyImages(images);
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return readyImages;
  }

  return readyImages.filter((image) => {
    const label = image.label.toLowerCase();
    return (
      label.includes(normalizedQuery) ||
      String(image.index).includes(normalizedQuery)
    );
  });
}

export function getImageMentionQuery(state: EditorState, triggerFrom: number) {
  const { selection, doc } = state;
  const caret = selection.from;

  if (caret <= triggerFrom + 1) {
    return "";
  }

  return doc.textBetween(triggerFrom + 1, caret, "\n", "\0");
}

function shouldTriggerImageMention(state: EditorState) {
  const { selection } = state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  const parent = $from.parent;
  if (!parent?.isTextblock) return false;
  if (parent.type?.spec?.code) return false;

  return true;
}

function isImageMentionStillValid(state: EditorState, triggerFrom: number) {
  if (triggerFrom < 1 || triggerFrom > state.doc.content.size) {
    return false;
  }

  const charAtTrigger = state.doc.textBetween(
    triggerFrom,
    triggerFrom + 1,
    "\0",
    "\0",
  );
  if (charAtTrigger !== "@") {
    return false;
  }

  const { selection } = state;
  if (!selection.empty) {
    return false;
  }
  if (selection.from < triggerFrom + 1) {
    return false;
  }

  const $trigger = state.doc.resolve(triggerFrom);
  const blockStart = $trigger.start($trigger.depth);
  const blockEnd = $trigger.end($trigger.depth);

  if (selection.from < blockStart || selection.from > blockEnd) {
    return false;
  }
  if (selection.$from.parent.type.spec.code) {
    return false;
  }

  const query = getImageMentionQuery(state, triggerFrom);
  if (/\s/.test(query) || query.includes("\0")) {
    return false;
  }

  return true;
}

export const ImageMention = Extension.create<ImageMentionOptions>({
  name: "imageMention",

  addOptions() {
    return {
      getImages: () => [],
    };
  },

  addCommands() {
    return {
      closeImageMention:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(ImageMentionPluginKey, { type: "close" }));
          }
          return true;
        },
      setImageMentionSelectedIndex:
        (index) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(
              tr.setMeta(ImageMentionPluginKey, {
                type: "setSelectedIndex",
                index,
              } satisfies ImageMentionMeta),
            );
          }
          return true;
        },
      insertImageMention:
        (attrs) =>
        ({ editor }) => {
          const pluginState = ImageMentionPluginKey.getState(
            editor.state,
          ) as ImageMentionPluginState | null;

          if (!pluginState?.isOpen || pluginState.triggerFrom == null) {
            return false;
          }

          return editor
            .chain()
            .focus()
            .deleteRange({
              from: pluginState.triggerFrom,
              to: editor.state.selection.from,
            })
            .insertContent({
              type: "imageTag",
              attrs,
            })
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    const getImages = this.options.getImages;
    const editor = this.editor;

    return [
      new Plugin<ImageMentionPluginState>({
        key: ImageMentionPluginKey,
        state: {
          init() {
            return getDefaultState();
          },
          apply(tr, prev, oldState, nextState) {
            const meta = tr.getMeta(ImageMentionPluginKey) as
              | ImageMentionMeta
              | undefined;

            if (meta?.type === "open") {
              return {
                isOpen: true,
                triggerFrom: meta.triggerFrom,
                selectedIndex: 0,
              };
            }

            if (meta?.type === "close") {
              return getDefaultState();
            }

            if (!prev.isOpen || prev.triggerFrom == null) {
              return prev;
            }

            const mapped = tr.mapping.mapResult(prev.triggerFrom);
            if (mapped.deleted) {
              return getDefaultState();
            }

            const nextTriggerFrom = mapped.pos;
            if (!isImageMentionStillValid(nextState, nextTriggerFrom)) {
              return getDefaultState();
            }

            const prevQuery = getImageMentionQuery(oldState, prev.triggerFrom);
            const nextQuery = getImageMentionQuery(nextState, nextTriggerFrom);
            const items = filterImageMentionItems(getImages(), nextQuery);
            const maxIndex = Math.max(0, items.length - 1);

            let selectedIndex =
              prevQuery === nextQuery ? prev.selectedIndex : 0;

            if (meta?.type === "setSelectedIndex") {
              selectedIndex = meta.index;
            }

            return {
              isOpen: true,
              triggerFrom: nextTriggerFrom,
              selectedIndex: Math.min(Math.max(0, selectedIndex), maxIndex),
            };
          },
        },
        props: {
          handleTextInput(view, from, to, text) {
            const state = view.state;
            if (text !== "@") {
              return false;
            }
            if (!shouldTriggerImageMention(state)) {
              return false;
            }

            const tr = state.tr.insertText(text, from, to);
            tr.setMeta(ImageMentionPluginKey, {
              type: "open",
              triggerFrom: from,
            } satisfies ImageMentionMeta);
            tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
            view.dispatch(tr);
            return true;
          },
          handleKeyDown(view, event) {
            const pluginState = ImageMentionPluginKey.getState(
              view.state,
            ) as ImageMentionPluginState | null;

            if (!pluginState?.isOpen || pluginState.triggerFrom == null) {
              return false;
            }
            if (event.isComposing) {
              return false;
            }

            const query = getImageMentionQuery(view.state, pluginState.triggerFrom);
            const items = filterImageMentionItems(getImages(), query);

            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (items.length === 0) {
                return true;
              }

              const nextIndex = (pluginState.selectedIndex + 1) % items.length;
              editor.commands.setImageMentionSelectedIndex(nextIndex);
              return true;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (items.length === 0) {
                return true;
              }

              const nextIndex =
                (pluginState.selectedIndex - 1 + items.length) % items.length;
              editor.commands.setImageMentionSelectedIndex(nextIndex);
              return true;
            }

            if (event.key === "Enter" || event.key === "Tab") {
              const activeItem = items[pluginState.selectedIndex];
              if (!activeItem) {
                // Keep ownership of Enter/Tab while the menu is open.
                // Falling through here would let ProseMirror insert a newline
                // or move focus away while the floating menu is still visible.
                event.preventDefault();
                editor.commands.closeImageMention();
                return true;
              }

              event.preventDefault();
              editor.commands.insertImageMention({
                imageId: activeItem.id,
                label: activeItem.label,
              });
              return true;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              editor.commands.closeImageMention();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

export default ImageMention;
