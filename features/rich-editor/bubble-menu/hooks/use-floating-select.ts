import { useState, useCallback, useMemo } from "react";
import {
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  type Placement,
} from "@floating-ui/react";

interface UseFloatingSelectOptions {
  placement?: Placement;
  offsetValue?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useFloatingSelect(options: UseFloatingSelectOptions = {}) {
  const { placement = "bottom-start", offsetValue = 8, onOpen, onClose } = options;
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context, elements } = useFloating({
    open: isOpen,
    onOpenChange: (nextOpen) => {
      if (nextOpen && !isOpen) onOpen?.();
      if (!nextOpen && isOpen) onClose?.();
      setIsOpen(nextOpen);
    },
    placement,
    middleware: [offset(offsetValue), flip(), shift({ padding: 8 })],
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
    ]
  );
}
