"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey, type EditorState } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  exitSuggestion,
  findSuggestionMatch as defaultFindSuggestionMatch,
  type SuggestionMatch,
  type SuggestionOptions,
  type Trigger,
} from "@tiptap/suggestion";
import { ImageMentionMenu } from "../components/image-mention-menu";
import type {
  ImageMentionMenuProps,
  ImageMentionMenuRef,
} from "../components/image-mention-menu";
import type { PromptResource, ReadyPromptResource } from "../types";
import {
  getPromptResourceToken,
  getPromptResources,
  isReadyPromptResource,
  sanitizePromptText,
} from "../utils";

export interface ImageMentionItem {
  id: string;
  resource: ReadyPromptResource;
  token: string;
  tokenLower: string;
}

export interface ImageMentionOptions {
  suggestion: Omit<SuggestionOptions<ImageMentionItem>, "editor">;
}

type ImageMentionSuggestionProps = {
  editor: Editor;
  query: string;
  items: ImageMentionItem[];
  command: (item: ImageMentionItem) => void;
  clientRect?: (() => DOMRect | null) | null;
};

export const ImageMentionPluginKey = new PluginKey("imageMention");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageMention: {
      closeImageMention: () => ReturnType;
      insertImageMention: (attrs: {
        resourceId: string;
        range: Range;
      }) => ReturnType;
    };
  }
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
  const normalizedQuery = sanitizePromptText(query).trim().toLowerCase();

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

function getImageMentionItems(editor: Editor, query: string) {
  return filterImageMentionItems(
    buildImageMentionIndex(getPromptResources(editor.state.doc)),
    query,
  );
}

function findImageMentionSuggestionMatch(config: Trigger): SuggestionMatch {
  const match = defaultFindSuggestionMatch(config);

  if (!match) {
    return null;
  }

  const query = sanitizePromptText(match.query);

  return {
    ...match,
    query,
    text: `${config.char}${query}`,
  };
}

function shouldAllowImageMention({
  state,
  range,
}: {
  state: EditorState;
  range: Range;
}) {
  const { selection } = state;

  if (!selection.empty) {
    return false;
  }

  const $from = selection.$from;
  const parent = $from.parent;

  if (!parent?.isTextblock) {
    return false;
  }

  if (parent.type?.spec?.code) {
    return false;
  }

  if (range.from < 1 || range.from > state.doc.content.size) {
    return false;
  }

  return true;
}

function buildMenuProps(
  props: ImageMentionSuggestionProps,
  selectedIndex: number,
  setSelectedIndex: (index: number) => void,
): ImageMentionMenuProps {
  const mentionIndex = buildImageMentionIndex(getPromptResources(props.editor.state.doc));
  const items = props.items;
  const activeIndex = getImageMentionActiveIndex(selectedIndex, items.length);

  return {
    items,
    query: sanitizePromptText(props.query),
    selectedIndex: activeIndex,
    hasReadyImages: mentionIndex.length > 0,
    clientRect: props.clientRect ?? null,
    onClose: () => {
      exitSuggestion(props.editor.view, ImageMentionPluginKey);
    },
    onSelect: (item) => {
      props.command(item);
    },
    onSelectIndex: (index) => {
      setSelectedIndex(index);
    },
  };
}

export const ImageMention = Extension.create<ImageMentionOptions>({
  name: "imageMention",

  addOptions() {
    return {
      suggestion: {
        pluginKey: ImageMentionPluginKey,
        char: "@",
        allowedPrefixes: null,
        allowSpaces: false,
        findSuggestionMatch: findImageMentionSuggestionMatch,
        startOfLine: false,
        allow: ({ state, range }) => {
          return shouldAllowImageMention({ state, range });
        },
        items: ({ editor, query }) => {
          return getImageMentionItems(editor, query);
        },
        command: ({ editor, range, props }) => {
          editor.commands.insertImageMention({
            resourceId: props.resource.id,
            range,
          });
        },
        render: () => {
          let reactRenderer:
            | ReactRenderer<ImageMentionMenuRef, ImageMentionMenuProps>
            | null = null;
          let selectedIndex = 0;
          let latestProps: ImageMentionSuggestionProps | null = null;

          const setSelectedIndex = (index: number) => {
            selectedIndex = index;

            if (!reactRenderer || !latestProps) {
              return;
            }

            reactRenderer.updateProps(
              buildMenuProps(latestProps, selectedIndex, setSelectedIndex),
            );
          };

          return {
            onStart: (props: ImageMentionSuggestionProps) => {
              selectedIndex = 0;
              latestProps = props;

              reactRenderer = new ReactRenderer(ImageMentionMenu, {
                editor: props.editor,
                props: buildMenuProps(props, selectedIndex, setSelectedIndex),
              });
            },
            onUpdate: (props: ImageMentionSuggestionProps) => {
              latestProps = props;

              if (!reactRenderer) {
                return;
              }

              reactRenderer.updateProps(
                buildMenuProps(props, selectedIndex, setSelectedIndex),
              );
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
              return reactRenderer?.ref?.onKeyDown(event) ?? false;
            },
            onExit: () => {
              reactRenderer?.destroy();
              reactRenderer = null;
              latestProps = null;
              selectedIndex = 0;
            },
          };
        },
      },
    };
  },

  addCommands() {
    return {
      closeImageMention:
        () =>
        ({ editor }) => {
          exitSuggestion(editor.view, ImageMentionPluginKey);
          return true;
        },
      insertImageMention:
        ({ resourceId, range }) =>
        ({ editor }) => {
          return editor
            .chain()
            .focus()
            .insertContentAt(range, {
              type: "imageTag",
              attrs: {
                resourceId,
              },
            })
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export default ImageMention;
