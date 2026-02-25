import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Message, UseChatStatus } from "../types";

type ScrollPhase = "idle" | "preparing" | "smoothAligning" | "tracking" | "released";
type ReconcileMode = "locked-live" | "locked-settle" | "released";
type AlignMode = "none" | "auto-allowed" | "auto-force";

interface ScrollControllerState {
  phase: ScrollPhase;
  anchorUserId: string | null;
}

interface UseTopPinnedScrollOptions {
  messages: Message[];
  status: UseChatStatus;
}

interface UseTopPinnedScrollResult {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesContentRef: RefObject<HTMLDivElement | null>;
  bottomSpacerHeight: number;
  isOverflowAnchorDisabled: boolean;
  isPinningInProgress: boolean;
  registerUserMessageRef: (messageId: string, node: HTMLDivElement | null) => void;
  onSubmitStart: () => void;
}

const USER_SCROLL_INTENT_WINDOW_MS = 180;
const USER_UNLOCK_THRESHOLD_PX = 24;
const SMOOTH_ALIGN_GUARD_MS = 500;
const SMOOTH_SCROLL_IGNORE_UNLOCK_MS = 450;
const AUTO_SCROLL_IGNORE_UNLOCK_MS = 120;

const isLockedPhase = (phase: ScrollPhase) => phase === "smoothAligning" || phase === "tracking";

export function useTopPinnedScroll({
  messages,
  status,
}: UseTopPinnedScrollOptions): UseTopPinnedScrollResult {
  const [controller, setController] = useState<ScrollControllerState>({
    phase: "idle",
    anchorUserId: null,
  });
  const controllerRef = useRef(controller);
  useLayoutEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [bottomSpacerHeight, setBottomSpacerHeight] = useState(0);
  const bottomSpacerHeightRef = useRef(0);
  useLayoutEffect(() => {
    bottomSpacerHeightRef.current = bottomSpacerHeight;
  }, [bottomSpacerHeight]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const userMessageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const ignoreUserScrollUnlockUntilRef = useRef(0);
  const lastUserScrollIntentAtRef = useRef(0);
  const deferAutoAlignUntilRef = useRef(0);

  const registerUserMessageRef = useCallback(
    (messageId: string, node: HTMLDivElement | null) => {
      if (node) {
        userMessageRefs.current.set(messageId, node);
        return;
      }
      userMessageRefs.current.delete(messageId);
    },
    []
  );

  const scrollUserMessageToTop = useCallback(
    (userMessageId: string, behavior: ScrollBehavior) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const messageElement = userMessageRefs.current.get(userMessageId);
      if (!messageElement) return;

      const containerRect = container.getBoundingClientRect();
      const messageRect = messageElement.getBoundingClientRect();
      const nextScrollTop = container.scrollTop + (messageRect.top - containerRect.top);
      container.scrollTo({ top: nextScrollTop, behavior });
    },
    []
  );

  const getRequiredBottomSpacerHeight = useCallback(
    (
      userMessageId: string,
      currentSpacerHeight: number = bottomSpacerHeightRef.current
    ): number | null => {
      const container = scrollContainerRef.current;
      const messageElement = userMessageRefs.current.get(userMessageId);
      if (!container || !messageElement) return null;

      const containerRect = container.getBoundingClientRect();
      const messageRect = messageElement.getBoundingClientRect();
      const userMessageTopOffset = container.scrollTop + (messageRect.top - containerRect.top);
      const scrollHeightWithoutSpacer = container.scrollHeight - currentSpacerHeight;
      const maxScrollTopWithoutSpacer = Math.max(
        scrollHeightWithoutSpacer - container.clientHeight,
        0
      );

      return Math.max(Math.ceil(userMessageTopOffset - maxScrollTopWithoutSpacer), 0);
    },
    []
  );

  const alignUserMessageToTop = useCallback(
    (userMessageId: string, behavior: ScrollBehavior) => {
      ignoreUserScrollUnlockUntilRef.current =
        Date.now() +
        (behavior === "smooth"
          ? SMOOTH_SCROLL_IGNORE_UNLOCK_MS
          : AUTO_SCROLL_IGNORE_UNLOCK_MS);
      scrollUserMessageToTop(userMessageId, behavior);
    },
    [scrollUserMessageToTop]
  );

  const reconcileSpacerForAnchor = useCallback(
    (anchorUserId: string, mode: ReconcileMode, alignMode: AlignMode) => {
      const requiredSpacerHeight = getRequiredBottomSpacerHeight(anchorUserId);
      if (requiredSpacerHeight === null) return;

      const nextSpacerHeight =
        mode === "locked-live"
          ? Math.max(requiredSpacerHeight, bottomSpacerHeightRef.current)
          : requiredSpacerHeight;

      if (Math.abs(nextSpacerHeight - bottomSpacerHeightRef.current) > 1) {
        setBottomSpacerHeight(nextSpacerHeight);
      }

      if (alignMode === "none") return;
      if (alignMode === "auto-allowed" && Date.now() < deferAutoAlignUntilRef.current) {
        return;
      }

      alignUserMessageToTop(anchorUserId, "auto");
    },
    [alignUserMessageToTop, getRequiredBottomSpacerHeight]
  );

  const onSubmitStart = useCallback(() => {
    ignoreUserScrollUnlockUntilRef.current = 0;
    lastUserScrollIntentAtRef.current = 0;
    deferAutoAlignUntilRef.current = 0;
    setBottomSpacerHeight(0);
    setController({ phase: "preparing", anchorUserId: null });
  }, []);

  useLayoutEffect(() => {
    if (controller.phase !== "preparing") return;

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latestUserMessage) return;

    const nextSpacerHeight = getRequiredBottomSpacerHeight(latestUserMessage.id, 0);
    if (nextSpacerHeight === null) return;

    const shouldReduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    deferAutoAlignUntilRef.current = shouldReduceMotion ? 0 : Date.now() + SMOOTH_ALIGN_GUARD_MS;
    setBottomSpacerHeight(nextSpacerHeight);
    setController({ phase: "smoothAligning", anchorUserId: latestUserMessage.id });
  }, [controller.phase, messages, getRequiredBottomSpacerHeight]);

  useLayoutEffect(() => {
    if (controller.phase !== "smoothAligning" || !controller.anchorUserId) return;

    const anchorUserId = controller.anchorUserId;
    const shouldReduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = shouldReduceMotion ? "auto" : "smooth";

    const frameId = requestAnimationFrame(() => {
      alignUserMessageToTop(anchorUserId, behavior);
      setController((prev) => {
        if (prev.phase !== "smoothAligning" || prev.anchorUserId !== anchorUserId) {
          return prev;
        }
        return { phase: "tracking", anchorUserId };
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [controller.phase, controller.anchorUserId, alignUserMessageToTop]);

  useEffect(() => {
    const anchorUserId = controller.anchorUserId;
    if (!anchorUserId) return;

    const anchorStillExists = messages.some((message) => message.id === anchorUserId);
    if (anchorStillExists) return;

    setController({ phase: "idle", anchorUserId: null });
    setBottomSpacerHeight(0);
  }, [messages, controller.anchorUserId]);

  useLayoutEffect(() => {
    const anchorUserId = controller.anchorUserId;
    if (!anchorUserId) return;

    if (controller.phase === "released") {
      reconcileSpacerForAnchor(anchorUserId, "released", "none");
      return;
    }

    if (!isLockedPhase(controller.phase)) return;

    const isSettled = status === "ready" || status === "error";
    reconcileSpacerForAnchor(
      anchorUserId,
      isSettled ? "locked-settle" : "locked-live",
      isSettled ? "auto-force" : "none"
    );
  }, [
    messages,
    status,
    controller.phase,
    controller.anchorUserId,
    reconcileSpacerForAnchor,
  ]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollKeys = new Set([
      "PageUp",
      "PageDown",
      "Home",
      "End",
      "ArrowUp",
      "ArrowDown",
      " ",
    ]);

    const markUserScrollIntent = () => {
      lastUserScrollIntentAtRef.current = Date.now();
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (!scrollKeys.has(event.key)) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        const isEditable =
          target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA";
        if (isEditable) return;
      }

      markUserScrollIntent();
    };

    container.addEventListener("wheel", markUserScrollIntent, { passive: true });
    container.addEventListener("touchmove", markUserScrollIntent, { passive: true });
    container.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
    window.addEventListener("keydown", handleKeydown, { passive: true });

    return () => {
      container.removeEventListener("wheel", markUserScrollIntent);
      container.removeEventListener("touchmove", markUserScrollIntent);
      container.removeEventListener("pointerdown", markUserScrollIntent);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!isLockedPhase(controller.phase) || !controller.anchorUserId) return;

    const lockedUserId = controller.anchorUserId;
    const handleScroll = () => {
      if (Date.now() < ignoreUserScrollUnlockUntilRef.current) return;

      const hasRecentUserIntent =
        Date.now() - lastUserScrollIntentAtRef.current <= USER_SCROLL_INTENT_WINDOW_MS;
      if (!hasRecentUserIntent) return;

      const messageElement = userMessageRefs.current.get(lockedUserId);
      if (!messageElement) return;

      const containerRect = container.getBoundingClientRect();
      const messageRect = messageElement.getBoundingClientRect();
      const offset = Math.abs(messageRect.top - containerRect.top);
      if (offset <= USER_UNLOCK_THRESHOLD_PX) return;

      setController((prev) => {
        if (!isLockedPhase(prev.phase) || prev.anchorUserId !== lockedUserId) {
          return prev;
        }
        return { phase: "released", anchorUserId: lockedUserId };
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [controller.phase, controller.anchorUserId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const messagesContent = messagesContentRef.current;
    if (!container || !messagesContent) return;
    if (typeof ResizeObserver === "undefined") return;

    let frameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        const { phase, anchorUserId } = controllerRef.current;
        if (!anchorUserId) return;

        if (phase === "released") {
          reconcileSpacerForAnchor(anchorUserId, "released", "none");
          return;
        }
        if (!isLockedPhase(phase)) return;

        const currentStatus = statusRef.current;
        const isSettled = currentStatus === "ready" || currentStatus === "error";
        reconcileSpacerForAnchor(
          anchorUserId,
          isSettled ? "locked-settle" : "locked-live",
          isSettled ? "auto-force" : "auto-allowed"
        );
      });
    });

    observer.observe(container);
    observer.observe(messagesContent);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [reconcileSpacerForAnchor]);

  const isOverflowAnchorDisabled = isLockedPhase(controller.phase);
  const isPinningInProgress =
    controller.phase === "preparing" || controller.phase === "smoothAligning" || controller.phase === "tracking";

  return {
    scrollContainerRef,
    messagesContentRef,
    bottomSpacerHeight,
    isOverflowAnchorDisabled,
    isPinningInProgress,
    registerUserMessageRef,
    onSubmitStart,
  };
}
