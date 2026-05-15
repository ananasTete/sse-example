"use client";

import { useRef, useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/src/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

interface AgentChatPromptInputProps {
  disabled?: boolean;
  isSending?: boolean;
  className?: string;
  placeholder?: string;
  onSubmit: (prompt: string) => void | Promise<void>;
}

function getSubmitErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发送失败，请重试";
}

export function AgentChatPromptInput({
  disabled,
  isSending,
  className,
  placeholder = "给 Agent 发送消息",
  onSubmit,
}: AgentChatPromptInputProps) {
  const [input, setInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const isSubmitting = isSending || isSubmittingRef.current;

  return (
    <PromptInput
      onSubmit={({ text }) => {
        const prompt = text.trim();
        if (!prompt || disabled || isSubmittingRef.current || isSending) return;

        isSubmittingRef.current = true;
        setInput("");
        setSubmitError(null);
        void Promise.resolve(onSubmit(prompt))
          .catch((error) => {
            setInput(prompt);
            setSubmitError(getSubmitErrorMessage(error));
          })
          .finally(() => {
            isSubmittingRef.current = false;
          });
      }}
      className={cn(
        "rounded-[16px] border border-black/10 bg-white shadow-sm shadow-black/5",
        className,
      )}
    >
      <PromptInputBody>
        <PromptInputTextarea
          value={input}
          onChange={(event) => {
            setInput(event.currentTarget.value);
            setSubmitError(null);
          }}
          placeholder={placeholder}
          disabled={disabled || isSubmitting}
          className="min-h-16 border-none bg-transparent px-4 py-3 text-[14px] leading-6 text-[#252820] placeholder:text-[#9a9c95] focus-visible:ring-0"
        />
      </PromptInputBody>
      {submitError ? (
        <div
          role="alert"
          className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700"
        >
          {submitError}
        </div>
      ) : null}
      <PromptInputFooter className="border-t border-black/[0.04] px-3 py-2">
        <div className="text-xs text-[#969891]">Agent</div>
        <PromptInputSubmit
          status={isSubmitting ? "submitted" : "ready"}
          disabled={!input.trim() || disabled || isSubmitting}
          className="rounded-full bg-[#20231f] text-white hover:bg-[#30342e] disabled:bg-[#d9dbd5] disabled:text-[#8d9088]"
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
