"use client";

import { Extension } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { PromptResource, ReadyPromptResource } from "../types";
import {
  getPromptResourceToken,
  getPromptResources,
  isReadyPromptResource,
} from "../utils";

export interface ImageMentionPluginState {
  isOpen: boolean;
  triggerFrom: number | null;
  query: string;
  selectedIndex: number;
}

export interface ImageMentionItem {
  id: string;
  resource: ReadyPromptResource;
  token: string;
  tokenLower: string;
}

export type ImageMentionMeta =
  | { type: "open"; triggerFrom: number }
  | { type: "close" }
  | { type: "setSelectedIndex"; index: number };

export const ImageMentionPluginKey = new PluginKey<ImageMentionPluginState>(
  "imageMention",
);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageMention: {
      closeImageMention: () => ReturnType;
      setImageMentionSelectedIndex: (index: number) => ReturnType;
      insertImageMention: (attrs: {
        resourceId: string;
      }) => ReturnType;
    };
  }
}

function getDefaultState(): ImageMentionPluginState {
  return {
    isOpen: false,
    triggerFrom: null,
    query: "",
    selectedIndex: 0,
  };
}

export function buildImageMentionIndex(
  resources: PromptResource[],
): ImageMentionItem[] {
  return resources.filter(isReadyPromptResource).map((resource) => {
    const token = getPromptResourceToken(resource);

    return {
      id: resource.id,
      resource,
      token,
      tokenLower: token.toLowerCase(),
    };
  });
}

export function filterImageMentionItems(
  mentionIndex: ImageMentionItem[],
  query: string,
): ImageMentionItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return mentionIndex;
  }

  return mentionIndex.filter((item) => item.tokenLower.includes(normalizedQuery));
}

export function getImageMentionActiveIndex(
  selectedIndex: number,
  itemCount: number,
) {
  if (itemCount === 0) {
    return 0;
  }

  return Math.min(Math.max(0, selectedIndex), itemCount - 1);
}

function getImageMentionItems(
  state: EditorState,
  query: string,
): ImageMentionItem[] {
  return filterImageMentionItems(
    buildImageMentionIndex(getPromptResources(state.doc)),
    query,
  );
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

export const ImageMention = Extension.create({
  name: "imageMention",

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
    const editor = this.editor;

    return [
      new Plugin<ImageMentionPluginState>({
        key: ImageMentionPluginKey,
        state: {
          init() {
            return getDefaultState();
          },
          apply(tr, prev, _oldState, nextState) {
            const meta = tr.getMeta(ImageMentionPluginKey) as
              | ImageMentionMeta
              | undefined;

            if (meta?.type === "open") {
              return {
                isOpen: true,
                triggerFrom: meta.triggerFrom,
                query: "",
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

            const nextQuery = getImageMentionQuery(nextState, nextTriggerFrom);

            let selectedIndex =
              prev.query === nextQuery ? prev.selectedIndex : 0;

            if (meta?.type === "setSelectedIndex") {
              selectedIndex = meta.index;
            }

            return {
              isOpen: true,
              triggerFrom: nextTriggerFrom,
              query: nextQuery,
              selectedIndex: Math.max(0, selectedIndex),
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

            const items = getImageMentionItems(view.state, pluginState.query);
            const activeIndex = getImageMentionActiveIndex(
              pluginState.selectedIndex,
              items.length,
            );

            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (items.length === 0) {
                return true;
              }

              const nextIndex = (activeIndex + 1) % items.length;
              editor.commands.setImageMentionSelectedIndex(nextIndex);
              return true;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (items.length === 0) {
                return true;
              }

              const nextIndex = (activeIndex - 1 + items.length) % items.length;
              editor.commands.setImageMentionSelectedIndex(nextIndex);
              return true;
            }

            if (event.key === "Enter" || event.key === "Tab") {
              const activeItem = items[activeIndex];
              if (!activeItem) {
                event.preventDefault();
                editor.commands.closeImageMention();
                return true;
              }

              event.preventDefault();
              editor.commands.insertImageMention({
                resourceId: activeItem.resource.id,
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
