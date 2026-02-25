import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Message, UseChatStatus } from "@/features/ai-sdk/hooks/use-chat/types";

type ScrollPhase = "idle" | "preparing" | "smoothAligning" | "tracking" | "released";
type ReconcileMode = "locked-live" | "locked-settle" | "released";
type AlignMode = "none" | "auto-allowed" | "auto-force";

interface ScrollControllerState {
  phase: ScrollPhase;
  anchorUserId: string | null;
  autoAlignBlockedUntil: number;
}

type ScrollControllerAction =
  | { type: "SUBMIT_START" }
  | { type: "ANCHOR_FOUND"; anchorUserId: string; autoAlignBlockedUntil: number }
  | { type: "SMOOTH_DONE"; anchorUserId: string }
  | { type: "USER_UNLOCK"; anchorUserId: string }
  | { type: "STREAM_SETTLED" }
  | { type: "ANCHOR_REMOVED"; anchorUserId: string };

interface TopPinnedScrollTuning {
  userScrollIntentWindowMs: number;
  userUnlockThresholdPx: number;
  smoothAlignGuardMs: number;
  smoothScrollIgnoreUnlockMs: number;
  autoScrollIgnoreUnlockMs: number;
}

interface UseTopPinnedScrollOptions {
  messages: Message[];
  status: UseChatStatus;
  tuning?: Partial<TopPinnedScrollTuning>;
  debug?: boolean;
}

interface ScrollDebugMetrics {
  offsetPx: number;
  spacerPx: number;
}

interface UseTopPinnedScrollResult {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesContentRef: RefObject<HTMLDivElement | null>;
  bottomSpacerHeight: number;
  isOverflowAnchorDisabled: boolean;
  isPinningInProgress: boolean;
  registerUserMessageRef: (messageId: string, node: HTMLDivElement | null) => void;
  onSubmitStart: () => void;
  phase: ScrollPhase;
  debugMetrics?: ScrollDebugMetrics;
}

const DEFAULT_TUNING: TopPinnedScrollTuning = {
  userScrollIntentWindowMs: 180,
  userUnlockThresholdPx: 24,
  smoothAlignGuardMs: 500,
  smoothScrollIgnoreUnlockMs: 450,
  autoScrollIgnoreUnlockMs: 120,
};

const isLockedPhase = (phase: ScrollPhase) => phase === "smoothAligning" || phase === "tracking";
const isSettledStatus = (status: UseChatStatus) => status === "ready" || status === "error";

function controllerReducer(
  state: ScrollControllerState,
  action: ScrollControllerAction
): ScrollControllerState {
  switch (action.type) {
    case "SUBMIT_START":
      return {
        phase: "preparing",
        anchorUserId: null,
        autoAlignBlockedUntil: 0,
      };

    case "ANCHOR_FOUND":
      if (state.phase !== "preparing") return state;
      return {
        phase: "smoothAligning",
        anchorUserId: action.anchorUserId,
        autoAlignBlockedUntil: action.autoAlignBlockedUntil,
      };

    case "SMOOTH_DONE":
      if (state.phase !== "smoothAligning" || state.anchorUserId !== action.anchorUserId) {
        return state;
      }
      return {
        ...state,
        phase: "tracking",
      };

    case "USER_UNLOCK":
      if (!isLockedPhase(state.phase) || state.anchorUserId !== action.anchorUserId) {
        return state;
      }
      return {
        ...state,
        phase: "released",
      };

    case "STREAM_SETTLED":
      if (!isLockedPhase(state.phase) || state.autoAlignBlockedUntil === 0) {
        return state;
      }
      return {
        ...state,
        autoAlignBlockedUntil: 0,
      };

    case "ANCHOR_REMOVED":
      if (!state.anchorUserId || state.anchorUserId !== action.anchorUserId) {
        return state;
      }
      return {
        phase: "idle",
        anchorUserId: null,
        autoAlignBlockedUntil: 0,
      };

    default:
      return state;
  }
}

interface AnchorMeasurement {
  requiredSpacerHeight: number;
  offsetFromTop: number;
}

interface ReconcileRequest {
  mode: ReconcileMode;
  alignMode: AlignMode;
}

interface PendingReconcilePayload extends ReconcileRequest {
  anchorUserId: string;
  requiredSpacerHeight: number;
  offsetFromTop: number;
}

export function useTopPinnedScroll({
  messages,
  status,
  tuning,
  debug = false,
}: UseTopPinnedScrollOptions): UseTopPinnedScrollResult {
  const mergedTuning = useMemo(
    () => ({
      ...DEFAULT_TUNING,
      ...tuning,
    }),
    [tuning]
  );

  const [controller, dispatchController] = useReducer(controllerReducer, {
    phase: "idle",
    anchorUserId: null,
    autoAlignBlockedUntil: 0,
  });
  const controllerRef = useRef(controller);
  useLayoutEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  const [bottomSpacerHeight, setBottomSpacerHeight] = useState(0);
  const bottomSpacerHeightRef = useRef(0);
  useLayoutEffect(() => {
    bottomSpacerHeightRef.current = bottomSpacerHeight;
  }, [bottomSpacerHeight]);

  const [debugMetrics, setDebugMetrics] = useState<ScrollDebugMetrics | undefined>(undefined);

  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
  }, [status]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const userMessageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const ignoreUserScrollUnlockUntilRef = useRef(0);
  const lastUserScrollIntentAtRef = useRef(0);

  const pendingReconcileRequestRef = useRef<ReconcileRequest | null>(null);
  const pendingReconcilePayloadRef = useRef<PendingReconcilePayload | null>(null);
  const readFrameIdRef = useRef<number | null>(null);
  const writeFrameIdRef = useRef<number | null>(null);

  const previousControllerRef = useRef(controller);
  useEffect(() => {
    if (debug && process.env.NODE_ENV !== "production") {
      const prev = previousControllerRef.current;
      if (prev.phase !== controller.phase || prev.anchorUserId !== controller.anchorUserId) {
        console.debug("[useTopPinnedScroll] phase", {
          from: prev.phase,
          to: controller.phase,
          anchorUserId: controller.anchorUserId,
        });
      }
    }
    previousControllerRef.current = controller;
  }, [controller, debug]);

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

  const scrollUserMessageToTop = useCallback((userMessageId: string, behavior: ScrollBehavior) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const messageElement = userMessageRefs.current.get(userMessageId);
    if (!messageElement) return;

    const containerRect = container.getBoundingClientRect();
    const messageRect = messageElement.getBoundingClientRect();
    const nextScrollTop = container.scrollTop + (messageRect.top - containerRect.top);
    container.scrollTo({ top: nextScrollTop, behavior });
  }, []);

  const measureAnchor = useCallback(
    (
      userMessageId: string,
      currentSpacerHeight: number = bottomSpacerHeightRef.current
    ): AnchorMeasurement | null => {
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

      return {
        requiredSpacerHeight: Math.max(
          Math.ceil(userMessageTopOffset - maxScrollTopWithoutSpacer),
          0
        ),
        offsetFromTop: Math.abs(messageRect.top - containerRect.top),
      };
    },
    []
  );

  const alignUserMessageToTop = useCallback(
    (userMessageId: string, behavior: ScrollBehavior) => {
      ignoreUserScrollUnlockUntilRef.current =
        Date.now() +
        (behavior === "smooth"
          ? mergedTuning.smoothScrollIgnoreUnlockMs
          : mergedTuning.autoScrollIgnoreUnlockMs);
      scrollUserMessageToTop(userMessageId, behavior);
    },
    [mergedTuning.autoScrollIgnoreUnlockMs, mergedTuning.smoothScrollIgnoreUnlockMs, scrollUserMessageToTop]
  );

  const cancelScheduledReconcile = useCallback(() => {
    if (readFrameIdRef.current !== null) {
      cancelAnimationFrame(readFrameIdRef.current);
      readFrameIdRef.current = null;
    }

    if (writeFrameIdRef.current !== null) {
      cancelAnimationFrame(writeFrameIdRef.current);
      writeFrameIdRef.current = null;
    }

    pendingReconcileRequestRef.current = null;
    pendingReconcilePayloadRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cancelScheduledReconcile();
    };
  }, [cancelScheduledReconcile]);

  const applyPendingReconcile = useCallback(() => {
    const payload = pendingReconcilePayloadRef.current;
    pendingReconcilePayloadRef.current = null;
    if (!payload) return;

    const currentController = controllerRef.current;
    if (currentController.anchorUserId !== payload.anchorUserId) return;

    const nextSpacerHeight =
      payload.mode === "locked-live"
        ? Math.max(payload.requiredSpacerHeight, bottomSpacerHeightRef.current)
        : payload.requiredSpacerHeight;

    if (Math.abs(nextSpacerHeight - bottomSpacerHeightRef.current) > 1) {
      setBottomSpacerHeight(nextSpacerHeight);
    }

    if (debug) {
      setDebugMetrics((prev) => {
        if (
          prev &&
          Math.abs(prev.offsetPx - payload.offsetFromTop) < 1 &&
          Math.abs(prev.spacerPx - nextSpacerHeight) < 1
        ) {
          return prev;
        }

        return {
          offsetPx: payload.offsetFromTop,
          spacerPx: nextSpacerHeight,
        };
      });
    }

    if (payload.alignMode === "none") return;
    if (
      payload.alignMode === "auto-allowed" &&
      Date.now() < currentController.autoAlignBlockedUntil
    ) {
      return;
    }

    alignUserMessageToTop(payload.anchorUserId, "auto");
  }, [alignUserMessageToTop, debug]);

  const scheduleReconcile = useCallback(
    (mode: ReconcileMode, alignMode: AlignMode) => {
      pendingReconcileRequestRef.current = { mode, alignMode };
      if (readFrameIdRef.current !== null) return;

      readFrameIdRef.current = requestAnimationFrame(() => {
        readFrameIdRef.current = null;

        const request = pendingReconcileRequestRef.current;
        pendingReconcileRequestRef.current = null;
        if (!request) return;

        const anchorUserId = controllerRef.current.anchorUserId;
        if (!anchorUserId) return;

        const measurement = measureAnchor(anchorUserId);
        if (!measurement) return;

        pendingReconcilePayloadRef.current = {
          anchorUserId,
          mode: request.mode,
          alignMode: request.alignMode,
          requiredSpacerHeight: measurement.requiredSpacerHeight,
          offsetFromTop: measurement.offsetFromTop,
        };

        if (writeFrameIdRef.current !== null) {
          cancelAnimationFrame(writeFrameIdRef.current);
        }

        writeFrameIdRef.current = requestAnimationFrame(() => {
          writeFrameIdRef.current = null;
          applyPendingReconcile();
        });
      });
    },
    [applyPendingReconcile, measureAnchor]
  );

  const onSubmitStart = useCallback(() => {
    ignoreUserScrollUnlockUntilRef.current = 0;
    lastUserScrollIntentAtRef.current = 0;
    cancelScheduledReconcile();
    setBottomSpacerHeight(0);
    dispatchController({ type: "SUBMIT_START" });
  }, [cancelScheduledReconcile]);

  useLayoutEffect(() => {
    if (controller.phase !== "preparing") return;

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latestUserMessage) return;

    const measurement = measureAnchor(latestUserMessage.id, 0);
    if (!measurement) return;

    const shouldReduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const autoAlignBlockedUntil = shouldReduceMotion
      ? 0
      : Date.now() + mergedTuning.smoothAlignGuardMs;

    setBottomSpacerHeight(measurement.requiredSpacerHeight);
    dispatchController({
      type: "ANCHOR_FOUND",
      anchorUserId: latestUserMessage.id,
      autoAlignBlockedUntil,
    });
  }, [controller.phase, measureAnchor, mergedTuning.smoothAlignGuardMs, messages]);

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
      dispatchController({ type: "SMOOTH_DONE", anchorUserId });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [controller.anchorUserId, controller.phase, alignUserMessageToTop]);

  useEffect(() => {
    const anchorUserId = controller.anchorUserId;
    if (!anchorUserId) return;

    const anchorStillExists = messages.some((message) => message.id === anchorUserId);
    if (anchorStillExists) return;

    cancelScheduledReconcile();
    setBottomSpacerHeight(0);
    dispatchController({ type: "ANCHOR_REMOVED", anchorUserId });
  }, [messages, controller.anchorUserId, cancelScheduledReconcile]);

  useLayoutEffect(() => {
    const anchorUserId = controller.anchorUserId;
    if (!anchorUserId) return;

    if (controller.phase === "released") {
      scheduleReconcile("released", "none");
      return;
    }

    if (!isLockedPhase(controller.phase)) return;

    const settled = isSettledStatus(status);
    if (settled) {
      dispatchController({ type: "STREAM_SETTLED" });
    }

    scheduleReconcile(
      settled ? "locked-settle" : "locked-live",
      settled ? "auto-force" : "none"
    );
  }, [messages, status, controller.phase, controller.anchorUserId, scheduleReconcile]);

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

      const targetNode = event.target instanceof Node ? event.target : null;
      const activeElement = document.activeElement;
      const isFromContainer = targetNode ? container.contains(targetNode) : false;
      const isActiveInContainer = activeElement ? container.contains(activeElement) : false;
      const isContainerHovered = container.matches(":hover");
      if (!isFromContainer && !isActiveInContainer && !isContainerHovered) return;

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
        Date.now() - lastUserScrollIntentAtRef.current <=
        mergedTuning.userScrollIntentWindowMs;
      if (!hasRecentUserIntent) return;

      const measurement = measureAnchor(lockedUserId);
      if (!measurement) return;

      if (measurement.offsetFromTop <= mergedTuning.userUnlockThresholdPx) return;

      dispatchController({ type: "USER_UNLOCK", anchorUserId: lockedUserId });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [
    controller.phase,
    controller.anchorUserId,
    measureAnchor,
    mergedTuning.userScrollIntentWindowMs,
    mergedTuning.userUnlockThresholdPx,
  ]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const messagesContent = messagesContentRef.current;
    if (!container || !messagesContent) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const currentController = controllerRef.current;
      const anchorUserId = currentController.anchorUserId;
      if (!anchorUserId) return;

      if (currentController.phase === "released") {
        scheduleReconcile("released", "none");
        return;
      }

      if (!isLockedPhase(currentController.phase)) return;

      const settled = isSettledStatus(statusRef.current);
      scheduleReconcile(
        settled ? "locked-settle" : "locked-live",
        settled ? "auto-force" : "auto-allowed"
      );
    });

    observer.observe(container);
    observer.observe(messagesContent);

    return () => {
      observer.disconnect();
    };
  }, [scheduleReconcile]);

  const isOverflowAnchorDisabled = isLockedPhase(controller.phase);
  const isPinningInProgress =
    controller.phase === "preparing" ||
    controller.phase === "smoothAligning" ||
    controller.phase === "tracking";

  return {
    scrollContainerRef,
    messagesContentRef,
    bottomSpacerHeight,
    isOverflowAnchorDisabled,
    isPinningInProgress,
    registerUserMessageRef,
    onSubmitStart,
    phase: controller.phase,
    debugMetrics: debug ? debugMetrics : undefined,
  };
}
