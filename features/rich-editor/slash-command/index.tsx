"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  FloatingPortal,
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
} from "@floating-ui/react";

import {
  getChildrenSlashMenuModel,
  getRootSlashMenuModel,
  type SlashCommandId,
  type SlashMenuItem,
} from "./commands";
import {
  SlashCommandPluginKey,
  type SlashCommandPluginState,
} from "../extensions/slash-command";
import "./slash-command.css";

interface SlashCommandMenuProps {
  editor: Editor;
}

function dispatchSlashMeta(editor: Editor, meta: { type: "close" }) {
  editor.view.dispatch(editor.state.tr.setMeta(SlashCommandPluginKey, meta));
}

function getQueryText(editor: Editor, slashFrom: number) {
  const { selection, doc } = editor.state;
  const caret = selection.from;
  if (caret <= slashFrom + 1) return "";
  return doc.textBetween(slashFrom + 1, caret, "\0", "\0");
}

function runSlashCommand(editor: Editor, commandId: SlashCommandId, slashFrom: number) {
  const caret = editor.state.selection.from;

  // Remove "/query" before applying the command (Notion-like).
  const chain = editor.chain().focus().deleteRange({ from: slashFrom, to: caret });

  switch (commandId) {
    case "paragraph":
      chain.setParagraph();
      break;
    case "heading1":
      chain.setHeading({ level: 1 });
      break;
    case "heading2":
      chain.setHeading({ level: 2 });
      break;
    case "heading3":
      chain.setHeading({ level: 3 });
      break;
    case "heading4":
      chain.setHeading({ level: 4 });
      break;
    case "heading5":
      chain.setHeading({ level: 5 });
      break;
    case "heading6":
      chain.setHeading({ level: 6 });
      break;
    case "bulletList":
      chain.toggleBulletList();
      break;
    case "orderedList":
      chain.toggleOrderedList();
      break;
    case "codeBlock":
      chain.toggleCodeBlock();
      break;
    case "blockquote":
      chain.toggleBlockquote();
      break;
    case "alignLeft":
      chain.setTextAlign("left");
      break;
    case "alignCenter":
      chain.setTextAlign("center");
      break;
    case "alignRight":
      chain.setTextAlign("right");
      break;
    case "bold":
      chain.toggleBold();
      break;
    case "italic":
      chain.toggleItalic();
      break;
    case "underline":
      chain.toggleUnderline();
      break;
    case "strike":
      chain.toggleStrike();
      break;
    case "inlineCode":
      chain.toggleCode();
      break;
    case "headingMore":
      // Should never be executed.
      break;
  }

  chain.run();
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const ui = useEditorState({
    editor,
    selector: ({ editor }) => {
      const pluginState =
        (SlashCommandPluginKey.getState(editor.state) as SlashCommandPluginState) ??
        ({ isOpen: false, slashFrom: null } satisfies SlashCommandPluginState);

      if (!pluginState.isOpen || pluginState.slashFrom == null) {
        return { isOpen: false, slashFrom: null as number | null, query: "" };
      }

      const slashFrom = pluginState.slashFrom;
      const query = getQueryText(editor, slashFrom);
      return { isOpen: true, slashFrom, query };
    },
  });

  const isOpen = ui.isOpen && ui.slashFrom != null;
  const slashFrom = ui.slashFrom;
  const query = ui.query;

  // Scroll lock while modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || slashFrom == null) return null;

  return (
    <SlashCommandMenuInner
      key={slashFrom}
      editor={editor}
      slashFrom={slashFrom}
      query={query}
    />
  );
}

function SlashCommandMenuInner({
  editor,
  slashFrom,
  query,
}: {
  editor: Editor;
  slashFrom: number;
  query: string;
}) {
  const [activeRootId, setActiveRootId] = useState<SlashCommandId | null>(null);
  const [activeSubId, setActiveSubId] = useState<SlashCommandId | null>(null);
  const [submenuParentId, setSubmenuParentId] = useState<SlashCommandId | null>(
    null
  );

  const rootModel = useMemo(() => getRootSlashMenuModel(query), [query]);
  const rootFlatItems = rootModel.flatItems;

  const submenuParentItem = useMemo(() => {
    if (!submenuParentId) return null;
    return rootFlatItems.find((i) => i.id === submenuParentId) ?? null;
  }, [rootFlatItems, submenuParentId]);

  const isSubmenuOpen = submenuParentItem != null;
  const submenuModel = useMemo(() => {
    if (!submenuParentItem) return { title: "", sections: [], flatItems: [] };
    return getChildrenSlashMenuModel(query, submenuParentItem);
  }, [query, submenuParentItem]);
  const submenuFlatItems = submenuModel.flatItems;

  const effectiveRootActiveId = useMemo(() => {
    if (rootFlatItems.length === 0) return null;
    const preferredId = submenuParentItem?.id ?? activeRootId;
    if (preferredId && rootFlatItems.some((i) => i.id === preferredId)) return preferredId;
    return rootFlatItems[0]?.id ?? null;
  }, [activeRootId, rootFlatItems, submenuParentItem?.id]);

  const rootActiveIndex = useMemo(() => {
    if (!effectiveRootActiveId) return 0;
    const idx = rootFlatItems.findIndex((i) => i.id === effectiveRootActiveId);
    return idx >= 0 ? idx : 0;
  }, [effectiveRootActiveId, rootFlatItems]);

  const effectiveSubActiveId = useMemo(() => {
    if (submenuFlatItems.length === 0) return null;
    if (activeSubId && submenuFlatItems.some((i) => i.id === activeSubId)) return activeSubId;
    return submenuFlatItems[0]?.id ?? null;
  }, [activeSubId, submenuFlatItems]);

  const subActiveIndex = useMemo(() => {
    if (!effectiveSubActiveId) return 0;
    const idx = submenuFlatItems.findIndex((i) => i.id === effectiveSubActiveId);
    return idx >= 0 ? idx : 0;
  }, [effectiveSubActiveId, submenuFlatItems]);

  const activeIndex = isSubmenuOpen ? subActiveIndex : rootActiveIndex;

  const rootItemRefs = useMemo(
    () => new Map<SlashCommandId, HTMLButtonElement>(),
    []
  );
  const subItemRefs = useMemo(
    () => new Map<SlashCommandId, HTMLButtonElement>(),
    []
  );

  const close = useCallback(() => {
    dispatchSlashMeta(editor, { type: "close" });
    editor.commands.focus();
  }, [editor]);

  const exitSubmenu = useCallback(() => {
    setSubmenuParentId(null);
    setActiveSubId(null);
  }, []);

  const enterSubmenu = useCallback(
    (item: SlashMenuItem) => {
      if (!item.children?.length) return;
      setActiveRootId(item.id);
      setSubmenuParentId(item.id);
      const model = getChildrenSlashMenuModel(query, item);
      setActiveSubId(model.flatItems[0]?.id ?? null);
    },
    [query]
  );

  const moveActive = useCallback(
    (delta: number) => {
      const items = isSubmenuOpen ? submenuFlatItems : rootFlatItems;
      const len = items.length;
      if (len <= 0) return;
      const next = (activeIndex + delta + len) % len;
      const nextItem = items[next];
      if (!nextItem) return;
      if (isSubmenuOpen) setActiveSubId(nextItem.id);
      else setActiveRootId(nextItem.id);
    },
    [activeIndex, isSubmenuOpen, rootFlatItems, submenuFlatItems]
  );

  const confirmActive = useCallback(() => {
    const item = isSubmenuOpen
      ? submenuFlatItems[subActiveIndex]
      : rootFlatItems[rootActiveIndex];
    if (!item) return;

    if (!isSubmenuOpen && item.children?.length) {
      enterSubmenu(item);
      return;
    }

    runSlashCommand(editor, item.id, slashFrom);
    close();
  }, [
    close,
    editor,
    enterSubmenu,
    isSubmenuOpen,
    rootActiveIndex,
    rootFlatItems,
    slashFrom,
    subActiveIndex,
    submenuFlatItems,
  ]);

  const keydownRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keydownRef.current = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      // Space exits, but should still insert the space into the document.
      if (e.key === " ") {
        dispatchSlashMeta(editor, { type: "close" });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(1);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isSubmenuOpen) return;
        const item = rootFlatItems[rootActiveIndex];
        if (item?.children?.length) enterSubmenu(item);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isSubmenuOpen) exitSubmenu();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        confirmActive();
        return;
      }
    };
  }, [
    close,
    confirmActive,
    editor,
    enterSubmenu,
    exitSubmenu,
    isSubmenuOpen,
    moveActive,
    rootActiveIndex,
    rootFlatItems,
  ]);

  useEffect(() => {
    if (!editor?.view?.dom) return;
    const handler = (e: KeyboardEvent) => keydownRef.current(e);
    editor.view.dom.addEventListener("keydown", handler, true);
    return () => {
      editor.view.dom.removeEventListener("keydown", handler, true);
    };
  }, [editor]);

  // Floating UI positioning
  const virtualReference = useMemo(() => {
    return {
      getBoundingClientRect: () => {
        try {
          const caret = editor.state.selection.from;
          const caretCoords = editor.view.coordsAtPos(caret);
          const slashCoords = editor.view.coordsAtPos(slashFrom);

          return {
            // Follow the caret vertically (keeps the menu close to the typing line),
            // but align the menu to the slash "pill" left edge.
            top: caretCoords.top,
            bottom: caretCoords.bottom,
            left: slashCoords.left,
            right: slashCoords.left,
            width: 0,
            height: Math.max(0, caretCoords.bottom - caretCoords.top),
            x: slashCoords.left,
            y: caretCoords.top,
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
          };
        }
      },
    };
  }, [editor, slashFrom]);

  const { refs, floatingStyles, elements } = useFloating({
    placement: "bottom-start",
    middleware: [
      offset(10),
      flip({
        fallbackPlacements: ["top-start", "bottom-end", "top-end"],
        padding: 16,
      }),
      shift({ padding: 16 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const isPositioned = !!elements.floating && floatingStyles.transform;

  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  const {
    refs: submenuRefs,
    floatingStyles: submenuFloatingStyles,
    elements: submenuElements,
  } = useFloating({
    placement: "right-start",
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ["left-start", "right-end", "left-end"], padding: 12 }),
      shift({ padding: 12 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const isSubmenuPositioned =
    !!submenuElements.floating && submenuFloatingStyles.transform;

  useEffect(() => {
    if (!isSubmenuOpen) return;
    if (!submenuParentItem) return;
    const anchorEl = rootItemRefs.get(submenuParentItem.id);
    if (!anchorEl) return;
    const raf = requestAnimationFrame(() => submenuRefs.setReference(anchorEl));
    return () => cancelAnimationFrame(raf);
  }, [isSubmenuOpen, rootItemRefs, submenuParentItem, submenuRefs]);

  useEffect(() => {
    const map = isSubmenuOpen ? subItemRefs : rootItemRefs;
    const activeId = isSubmenuOpen ? effectiveSubActiveId : effectiveRootActiveId;
    if (!activeId) return;
    const el = map.get(activeId);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [
    isSubmenuOpen,
    effectiveRootActiveId,
    effectiveSubActiveId,
    rootItemRefs,
    subItemRefs,
  ]);

  const handleBackdropPointerDown = useCallback(() => {
    close();
  }, [close]);

  const handleMenuPointerDown = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleHoverItem = useCallback(
    (item: SlashMenuItem) => {
      setActiveRootId(item.id);
      if (!isSubmenuOpen) return;
      if (!item.children?.length) {
        exitSubmenu();
        return;
      }
      if (submenuParentId !== item.id) {
        enterSubmenu(item);
      }
    },
    [enterSubmenu, exitSubmenu, isSubmenuOpen, submenuParentId]
  );

  const handleClickItem = useCallback(
    (item: SlashMenuItem) => {
      if (item.children?.length) {
        enterSubmenu(item);
        return;
      }
      if (isSubmenuOpen) exitSubmenu();

      runSlashCommand(editor, item.id, slashFrom);
      close();
    },
    [
      close,
      editor,
      enterSubmenu,
      exitSubmenu,
      isSubmenuOpen,
      slashFrom,
    ]
  );

  const handleHoverSubItem = useCallback(
    (item: SlashMenuItem) => {
      setActiveSubId(item.id);
    },
    []
  );

  const handleClickSubItem = useCallback(
    (item: SlashMenuItem) => {
      runSlashCommand(editor, item.id, slashFrom);
      close();
    },
    [close, editor, slashFrom]
  );

  return (
    <FloatingPortal>
      <div
        className="slash-command-backdrop"
        onPointerDown={handleBackdropPointerDown}
        style={{ visibility: isPositioned ? "visible" : "hidden" }}
      />

      <div
        ref={(node) => refs.setFloating(node)}
        style={{
          ...floatingStyles,
          visibility: isPositioned ? "visible" : "hidden",
        }}
        className="slash-command-menu"
        role="dialog"
        aria-modal="true"
        onPointerDown={handleMenuPointerDown}
      >
        <div className="slash-command-columns">
          <div className="slash-command-pane" role="menu">
	            {rootModel.flatItems.length === 0 ? (
	              <div className="slash-command-empty">No results</div>
	            ) : (
	              rootModel.sections.map((section) => (
	                <div key={section.id} className="slash-command-section">
	                  <div className="slash-command-section-title">
	                    {section.title}
	                  </div>
	                  {section.items.map((item) => {
	                    const isActive = item.id === effectiveRootActiveId;
	                    const RightIcon = item.rightIcon;
	                    const Icon = item.icon;

	                    return (
	                      <button
	                        key={item.id}
	                        type="button"
	                        className={`slash-command-item ${isActive ? "is-active" : ""}`}
	                        role="menuitem"
	                        tabIndex={-1}
	                        ref={(node) => {
	                          if (!node) {
	                            rootItemRefs.delete(item.id);
	                            return;
	                          }
	                          rootItemRefs.set(item.id, node);
	                        }}
	                        onPointerEnter={() => handleHoverItem(item)}
	                        onPointerDown={handleMenuPointerDown}
	                        onClick={() => handleClickItem(item)}
	                      >
	                        <Icon size={16} className="slash-command-item-icon" />
	                        <span className="slash-command-item-label">
	                          {item.label}
	                        </span>
	                        {RightIcon && (
	                          <RightIcon
	                            size={16}
	                            className="slash-command-item-right"
	                          />
	                        )}
	                      </button>
	                    );
	                  })}
	                </div>
	              ))
	            )}
	          </div>
	        </div>
	      </div>

	      {isSubmenuOpen && submenuParentItem && (
	        <div
	          ref={(node) => submenuRefs.setFloating(node)}
	          style={{
	            ...submenuFloatingStyles,
	            visibility: isSubmenuPositioned ? "visible" : "hidden",
	          }}
	          className="slash-command-submenu"
	          role="menu"
	          onPointerDown={handleMenuPointerDown}
	        >
	          <div className="slash-command-subheader">
	            <div className="slash-command-subtitle">{submenuModel.title}</div>
	          </div>

	          <div className="slash-command-sublist">
	            {submenuModel.flatItems.length === 0 ? (
	              <div className="slash-command-empty">No results</div>
	            ) : (
	              submenuModel.sections.map((section) => (
	                <div key={section.id} className="slash-command-section">
	                  {section.items.map((item) => {
	                    const isActive = item.id === effectiveSubActiveId;
	                    const Icon = item.icon;

	                    return (
	                      <button
	                        key={item.id}
	                        type="button"
	                        className={`slash-command-item ${isActive ? "is-active" : ""}`}
	                        role="menuitem"
	                        tabIndex={-1}
	                        ref={(node) => {
	                          if (!node) {
	                            subItemRefs.delete(item.id);
	                            return;
	                          }
	                          subItemRefs.set(item.id, node);
	                        }}
	                        onPointerEnter={() => handleHoverSubItem(item)}
	                        onPointerDown={handleMenuPointerDown}
	                        onClick={() => handleClickSubItem(item)}
	                      >
	                        <Icon size={16} className="slash-command-item-icon" />
	                        <span className="slash-command-item-label">
	                          {item.label}
	                        </span>
	                      </button>
	                    );
	                  })}
	                </div>
	              ))
	            )}
	          </div>
	        </div>
	      )}
	    </FloatingPortal>
	  );
	}
