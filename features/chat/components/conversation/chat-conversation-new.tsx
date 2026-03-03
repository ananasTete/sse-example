"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LayoutGroup, motion } from "framer-motion";
import { ChatConversationHeader } from "./chat-conversation-header";
import { ChatConversationInput } from "./chat-conversation-input";

const DEFAULT_MODEL = "openai/gpt-5-nano";
const NEW_CHAT_DOCK_TRANSITION_MS = 260;

interface NewChatConversationProps {
  isCreatingChat: boolean;
  creationError?: Error | null;
  onCreateChat?: (text: string, model: string) => Promise<void>;
}

export function NewChatConversation({
  isCreatingChat,
  creationError,
  onCreateChat,
}: NewChatConversationProps) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [input, setInput] = useState("");
  const [isDockingComposer, setIsDockingComposer] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const submitCurrentInput = useCallback(async () => {
    const text = input.trim();
    if (!text || !onCreateChat || isCreatingChat || isDockingComposer) return;

    setIsDockingComposer(true);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, NEW_CHAT_DOCK_TRANSITION_MS);
    });

    try {
      await onCreateChat(text, selectedModel);
    } finally {
      if (isMountedRef.current) {
        setIsDockingComposer(false);
      }
    }
  }, [input, isCreatingChat, isDockingComposer, onCreateChat, selectedModel]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void submitCurrentInput();
    },
    [submitCurrentInput],
  );

  const shouldDockComposer = isDockingComposer || isCreatingChat;
  const composerTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f9f8f6] font-sans text-slate-800">
      <ChatConversationHeader
        selectedModel={selectedModel}
        isLoading={isCreatingChat}
        onModelChange={setSelectedModel}
      />
      <LayoutGroup id="new-chat-composer-transition">
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col items-center justify-center px-4">
            <motion.div
              initial={false}
              animate={
                shouldDockComposer
                  ? { opacity: 0, y: -20, pointerEvents: "none" }
                  : { opacity: 1, y: 0, pointerEvents: "auto" }
              }
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="mb-8 text-center"
            >
              <p className="text-5xl font-semibold tracking-tight text-stone-700 sm:text-6xl">
                What can I do for you?
              </p>
            </motion.div>

            {!shouldDockComposer ? (
              <motion.div
                layoutId="new-chat-composer"
                transition={composerTransition}
                className="w-full"
              >
                <ChatConversationInput
                  input={input}
                  isHeroMode
                  isLoading={isCreatingChat}
                  error={creationError ?? null}
                  onInputChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onSubmit={() => {
                    void submitCurrentInput();
                  }}
                  onStop={() => {
                    // no streaming to stop in /chat creation stage
                  }}
                />
              </motion.div>
            ) : null}
          </div>
        </div>

        <div className="z-10 shrink-0">
          {shouldDockComposer ? (
            <motion.div layoutId="new-chat-composer" transition={composerTransition}>
              <ChatConversationInput
                input={input}
                isHeroMode={false}
                isLoading={isCreatingChat}
                error={creationError ?? null}
                onInputChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                onSubmit={() => {
                  void submitCurrentInput();
                }}
                onStop={() => {
                  // no streaming to stop in /chat creation stage
                }}
              />
            </motion.div>
          ) : null}
        </div>
      </LayoutGroup>
    </div>
  );
}
