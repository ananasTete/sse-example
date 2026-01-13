"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import TiptapEditor from "@/features/rich-editor/editor";
import { AgentChat } from "@/features/agent-editor/components/agent-chat";
import { useEditorAgent } from "@/features/agent-editor/hooks/use-editor-agent";
import { ErrorBoundary } from "@/features/agent-editor/components/error-boundary";

export default function AgentEditorPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorAgent = useEditorAgent({ editor });

  const handleEditorReady = (editorInstance: Editor) => {
    setEditor(editorInstance);
  };

  return (
    <div className="h-screen p-4">
      <div className="h-full flex gap-2 border border-gray-200 ">
        {/* 编辑器区域 */}
        <div className="rounded-md flex-1  overflow-auto">
          <div className="w-200 mx-auto">
            <ErrorBoundary>
              <TiptapEditor onEditorReady={handleEditorReady} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Chatbot 区域 */}
        <div className="rounded-md w-150 overflow-hidden">
          <ErrorBoundary>
            <AgentChat editorAgent={editorAgent} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
