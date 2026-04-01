"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  type VirtualElement,
} from "@floating-ui/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import { CroppedImagePreview } from "./cropped-image-preview";
import {
  getImageMentionActiveIndex,
  type ImageMentionItem,
} from "../extensions/image-mention";

export interface ImageMentionMenuProps {
  items: ImageMentionItem[];
  query: string;
  selectedIndex: number;
  hasReadyImages: boolean;
  clientRect: (() => DOMRect | null) | null;
  onSelect: (item: ImageMentionItem) => void;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
}

export interface ImageMentionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const EMPTY_RECT = {
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

export const ImageMentionMenu = forwardRef<
  ImageMentionMenuRef,
  ImageMentionMenuProps
>(function ImageMentionMenu(
  {
    items,
    query,
    selectedIndex,
    hasReadyImages,
    clientRect,
    onSelect,
    onSelectIndex,
    onClose,
  },
  ref,
) {
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeIndex = getImageMentionActiveIndex(selectedIndex, items.length);
  const activeItem = items[activeIndex] ?? null;
  const isOpen = clientRect !== null;

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event) {
        if (event.isComposing) {
          return false;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (items.length === 0) {
            return true;
          }

          onSelectIndex((activeIndex + 1) % items.length);
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (items.length === 0) {
            return true;
          }

          onSelectIndex((activeIndex - 1 + items.length) % items.length);
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();

          if (!activeItem) {
            onClose();
            return true;
          }

          onSelect(activeItem);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return true;
        }

        return false;
      },
    }),
    [activeIndex, activeItem, items, onClose, onSelect, onSelectIndex],
  );

  const virtualReference = useMemo<VirtualElement | null>(() => {
    if (!isOpen || !clientRect) {
      return null;
    }

    return {
      getBoundingClientRect() {
        try {
          return clientRect() ?? EMPTY_RECT;
        } catch {
          return EMPTY_RECT;
        }
      },
    };
  }, [clientRect, isOpen]);

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

      const floating = refs.floating.current;
      if (floating?.contains(target)) return;

      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, onClose, refs.floating]);

  const isPositioned =
    isOpen && !!elements.floating && Boolean(floatingStyles.transform);

  if (!isOpen) {
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
          {items.length > 0 ? (
            items.map((item, index) => {
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
                    onSelectIndex(index);
                  }}
                  onClick={() => {
                    onSelect(item);
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
              {hasReadyImages
                ? `没有匹配“${query}”的图片`
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
});

export default ImageMentionMenu;
