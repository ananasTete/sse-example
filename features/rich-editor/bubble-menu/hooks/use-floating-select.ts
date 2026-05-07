import { useState, useCallback, useMemo } from "react";
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  offset,
  shift,
  size,
  autoUpdate,
  type Placement,
} from "@floating-ui/react";

const DEFAULT_MAX_HEIGHT = 420;
const DEFAULT_VIEWPORT_PADDING = 8;

interface UseFloatingSelectOptions {
  placement?: Placement;
  offsetValue?: number;
  maxHeight?: number;
  viewportPadding?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useFloatingSelect(options: UseFloatingSelectOptions = {}) {
  const {
    placement = "bottom-start",
    offsetValue = 8,
    maxHeight = DEFAULT_MAX_HEIGHT,
    viewportPadding = DEFAULT_VIEWPORT_PADDING,
    onOpen,
    onClose,
  } = options;
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context, elements } = useFloating({
    open: isOpen,
    onOpenChange: (nextOpen) => {
      if (nextOpen && !isOpen) onOpen?.();
      if (!nextOpen && isOpen) onClose?.();
      setIsOpen(nextOpen);
    },
    placement,
    middleware: [
      offset(offsetValue),
      size({
        padding: viewportPadding,
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.max(0, Math.min(maxHeight, availableHeight))}px`,
            overflowY: "auto",
          });
        },
      }),
      shift({ padding: viewportPadding }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const isPositioned = !!elements.floating && floatingStyles.transform;

  const safeFloatingStyles = useMemo(() => {
    return {
      ...floatingStyles,
      visibility: isPositioned ? "visible" : "hidden",
    } as React.CSSProperties;
  }, [floatingStyles, isPositioned]);

  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => setIsOpen(true), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // 提取 callback refs，避免在组件渲染期间访问 refs 对象 (React 19 严格模式)
  const setReference = refs.setReference;
  const setFloating = refs.setFloating;

  return useMemo(
    () => ({
      isOpen,
      setIsOpen,
      open,
      close,
      toggle,
      setReference,
      setFloating,
      floatingStyles: safeFloatingStyles,
      context,
      getReferenceProps,
      getFloatingProps,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      setReference,
      setFloating,
      safeFloatingStyles,
      context,
      getReferenceProps,
      getFloatingProps,
    ],
  );
}
