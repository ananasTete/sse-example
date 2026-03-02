import { useEffect, useRef, useState } from "react";

interface UseDelayedVisibilityOptions {
  delayMs?: number; // 加载开始后延迟多久才显示
  minVisibleMs?: number; // 一旦显示，至少显示多久
}

/**
 * 用于延时显示骨架屏，避免闪烁
 */
export function useDelayedVisibility(
  active: boolean,
  options: UseDelayedVisibilityOptions = {},
) {
  const { delayMs = 150, minVisibleMs = 300 } = options;
  const [visible, setVisible] = useState(false); // 最终是否显示
  const shownAtRef = useRef<number | null>(null); // 显示的时间
  const showTimeoutRef = useRef<number | null>(null); // 延迟显示定时器
  const hideTimeoutRef = useRef<number | null>(null); // 延迟隐藏定时器（用于保证最短显示时长）

  // 卸载时清理定时器，避免内存泄漏
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current !== null) {
        window.clearTimeout(showTimeoutRef.current);
      }
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // 一开始时 active 为 false 设置延迟计时器。active 变为 true 后清除延迟计时器，并设置显示计时器
  useEffect(() => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (active) {
      if (visible) return;

      if (showTimeoutRef.current !== null) {
        window.clearTimeout(showTimeoutRef.current);
      }

      showTimeoutRef.current = window.setTimeout(() => {
        showTimeoutRef.current = null;
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return;
    }

    if (showTimeoutRef.current !== null) {
      window.clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    if (!visible) return;

    const shownAt = shownAtRef.current ?? Date.now();
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(minVisibleMs - elapsed, 0);

    if (remaining === 0) {
      shownAtRef.current = null;
      setVisible(false);
      return;
    }

    hideTimeoutRef.current = window.setTimeout(() => {
      hideTimeoutRef.current = null;
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
  }, [active, delayMs, minVisibleMs, visible]);

  return visible;
}
