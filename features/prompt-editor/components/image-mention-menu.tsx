"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  type VirtualElement,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { CroppedImagePreview } from "./cropped-image-preview";
import {
  buildImageMentionIndex,
  filterImageMentionItems,
  getImageMentionActiveIndex,
  ImageMentionPluginKey,
  type ImageMentionItem,
  type ImageMentionPluginState,
} from "../extensions/image-mention";
import { getPromptResources } from "../utils";

export interface ImageMentionMenuProps {
  editor: Editor;
}

function getClosedState(): ImageMentionPluginState {
  return {
    isOpen: false,
    triggerFrom: null,
    query: "",
    selectedIndex: 0,
  };
}

export function ImageMentionMenu({ editor }: ImageMentionMenuProps) {
  const ui = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const mentionIndex = buildImageMentionIndex(
        getPromptResources(currentEditor.state.doc),
      );
      const pluginState =
        (ImageMentionPluginKey.getState(
          currentEditor.state,
        ) as ImageMentionPluginState | null) ?? getClosedState();

      if (!pluginState.isOpen || pluginState.triggerFrom == null) {
        return {
          ...pluginState,
          caret: null as number | null,
          hasReadyImages: mentionIndex.length > 0,
          items: [] as ImageMentionItem[],
        };
      }

      return {
        ...pluginState,
        caret: currentEditor.state.selection.from,
        hasReadyImages: mentionIndex.length > 0,
        items: filterImageMentionItems(mentionIndex, pluginState.query),
      };
    },
  });

  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeIndex = getImageMentionActiveIndex(
    ui.selectedIndex,
    ui.items.length,
  );
  const activeItem = ui.items[activeIndex] ?? null;
  const isOpen = ui.isOpen && ui.triggerFrom != null && ui.caret != null;

  const virtualReference = useMemo<VirtualElement | null>(() => {
    if (!isOpen || ui.triggerFrom == null || ui.caret == null) {
      return null;
    }

    const triggerFrom = ui.triggerFrom;
    const caret = ui.caret;

    return {
      getBoundingClientRect() {
        try {
          const triggerRect = editor.view.coordsAtPos(triggerFrom);
          const caretRect = editor.view.coordsAtPos(caret);

          return {
            top: caretRect.top,
            bottom: caretRect.bottom,
            left: triggerRect.left,
            right: triggerRect.left,
            width: 0,
            height: Math.max(0, caretRect.bottom - caretRect.top),
            x: triggerRect.left,
            y: caretRect.top,
            toJSON: () => ({}),
          };
        } catch {
          return {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
      },
    };
  }, [editor.view, isOpen, ui.caret, ui.triggerFrom]);

  const { refs, floatingStyles, elements } = useFloating({
    open: isOpen,
    placement: "bottom-start",
    middleware: [
      offset(10),
      flip({
        fallbackPlacements: ["top-start", "bottom-end", "top-end"],
        padding: 12,
      }),
      shift({ padding: 12 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  useEffect(() => {
    if (!isOpen || !activeItem) return;

    const node = itemRefs.current.get(activeItem.id);
    if (!node) return;

    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [activeItem, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editor.view.dom.contains(target)) return;

      const floating = refs.floating.current;
      if (floating?.contains(target)) return;

      editor.commands.closeImageMention();
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [editor, isOpen, refs.floating]);

  const isPositioned =
    isOpen && !!elements.floating && Boolean(floatingStyles.transform);

  if (!isOpen || ui.triggerFrom == null) {
    return null;
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{
          ...floatingStyles,
          visibility: isPositioned ? "visible" : "hidden",
        }}
        className="z-50 w-[320px] overflow-hidden border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
        role="listbox"
        aria-label="已添加图片"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      >
        <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          Images
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5">
          {ui.items.length > 0 ? (
            ui.items.map((item, index) => {
              const image = item.resource;
              const isActive = index === activeIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  ref={(node) => {
                    if (!node) {
                      itemRefs.current.delete(item.id);
                      return;
                    }

                    itemRefs.current.set(item.id, node);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border border-transparent px-2 py-2 text-left transition",
                    isActive
                      ? "border-slate-300 bg-slate-950 text-white"
                      : "text-slate-700 hover:border-slate-200 hover:bg-slate-50",
                  )}
                  onMouseEnter={() => {
                    editor.commands.setImageMentionSelectedIndex(index);
                  }}
                  onClick={() => {
                    editor.commands.insertImageMention({
                      resourceId: item.id,
                    });
                  }}
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 overflow-hidden border",
                      isActive
                        ? "border-white/20 bg-white/10"
                        : "border-slate-200 bg-slate-100",
                    )}
                  >
                    <CroppedImagePreview
                      src={image.asset.url}
                      alt={item.token}
                      crop={image.transform?.crop}
                      className="h-full w-full"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{item.token}</div>
                    <div
                      className={cn(
                        "truncate text-xs",
                        isActive ? "text-slate-300" : "text-slate-500",
                      )}
                    >
                      {image.transform?.crop?.enabled ? "已裁切图片" : "原始图片"}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-6 text-center text-sm text-slate-500">
              {ui.hasReadyImages
                ? `没有匹配“${ui.query}”的图片`
                : "暂无可插入图片"}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-400">
          ↑ ↓ 切换 · Enter / Tab 插入 · Esc 关闭
        </div>
      </div>
    </FloatingPortal>
  );
}

export default ImageMentionMenu;
