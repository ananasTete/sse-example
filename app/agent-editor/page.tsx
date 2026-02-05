"use client";

import { useState, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import TiptapEditor from "@/features/rich-editor/editor";
import { AgentChat } from "@/features/agent-editor/components/agent-chat";
import { useEditorAgent } from "@/features/agent-editor/hooks/use-editor-agent";
import { ErrorBoundary } from "@/features/agent-editor/components/error-boundary";

export default function AgentEditorPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorAgent = useEditorAgent({ editor });

  // Diff 回调 ref，用于连接 AgentChat 和 TiptapEditor
  const diffCallbacksRef = useRef<{
    onAccept?: (suggestionId: string) => void;
    onReject?: (suggestionId: string) => void;
  }>({});

  const handleEditorReady = (editorInstance: Editor) => {
    setEditor(editorInstance);
  };

  // 编辑器中的 diff 接受回调
  const handleDiffAccept = useCallback((suggestionId: string) => {
    diffCallbacksRef.current.onAccept?.(suggestionId);
  }, []);

  // 编辑器中的 diff 拒绝回调
  const handleDiffReject = useCallback((suggestionId: string) => {
    diffCallbacksRef.current.onReject?.(suggestionId);
  }, []);

  return (
    <div className="h-screen p-4 bg-[#fbf7f2]">
      <div className="h-full flex gap-2 border border-[#ece4d8] bg-[#fdfaf6]">
        {/* 编辑器区域 */}
        <div className="rounded-sm flex-1 overflow-auto bg-white shadow-[0_1px_0_rgba(63,53,45,0.05)]">
          <div className="w-200 mx-auto">
            <ErrorBoundary>
              <TiptapEditor
                onEditorReady={handleEditorReady}
                onDiffAccept={handleDiffAccept}
                onDiffReject={handleDiffReject}
              />
            </ErrorBoundary>
          </div>
        </div>

        {/* Chatbot 区域 */}
        <div className="rounded-sm w-150 overflow-hidden">
          <ErrorBoundary>
            <AgentChat
              editorAgent={editorAgent}
              diffCallbacksRef={diffCallbacksRef}
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
