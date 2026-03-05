import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { ChatEngine, ChatEngineOptions } from "../../core/chat-engine";
import { SendMessageOptions, RegenerateOptions } from "./types";

export function useChatV2(options: ChatEngineOptions) {
  // 1. Instantiation: Create Chat Engine just once and retain it
  const engineRef = useRef<ChatEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ChatEngine(options);
  }
  const engine = engineRef.current;

  // 2. State Mapping: Bind React closely to the vanilla state object via observers
  const snapshot = useSyncExternalStore(
    useCallback((onStoreChange) => engine.subscribe(onStoreChange), [engine]),
    () => engine.getSnapshot(),
    () => engine.getSnapshot(),
  );

  // 3. Graceful Cleanup & Mount Handlers
  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, [engine]);

  useEffect(() => {
    engine.onMount(options.initialActiveRun);
  }, [engine, options.chatId, options.initialActiveRun]);

  // Derived Values
  const activeMessages = useMemo(
    () => engine.getActiveMessages(),
    [snapshot.conversation],
  );

  // Handlers
  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    engine.setInput(e.target.value);
  };

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!snapshot.input.trim()) return;

    const messageText = snapshot.input;
    engine.setInput(""); // Optimistic clear
    await engine.sendMessage(messageText, {
      trigger: options.trigger || "submit-message",
    });
  };

  return {
    conversation: snapshot.conversation,
    activeMessages,
    cursorId: snapshot.conversation.cursorId,
    status: snapshot.status,
    error: snapshot.error,
    input: snapshot.input,
    isLoading:
      snapshot.status === "submitted" || snapshot.status === "streaming",

    // State Mutators
    handleInputChange,
    setInput: (val: string) => engine.setInput(val),
    setCursor: (nodeId: string) => engine.setCursor(nodeId),

    // Advanced Branch Reads (no re-renders unless tree changes)
    getPathMessages: (nodeId: string) => engine.getPathMessagesByNode(nodeId),
    getChildren: (nodeId: string) => engine.getChildren(nodeId),

    // Network Actions
    sendMessage: (content: string, opts?: SendMessageOptions) =>
      engine.sendMessage(content, opts),
    handleSubmit,
    regenerate: (opts?: RegenerateOptions) => engine.regenerate(opts),
    stop: () => engine.stop(),
  };
}

export type {
  UseChatV2Options,
  SendMessageOptions,
  RegenerateOptions,
} from "./types";
