import { useState, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import TiptapEditor from "@/features/rich-editor/editor";
import { AgentChat } from "@/features/agent-editor/components/agent-chat";
import { useEditorAgent } from "@/features/agent-editor/hooks/use-editor-agent";
import { ErrorBoundary } from "@/features/agent-editor/components/error-boundary";

export const Route = createFileRoute("/agent-editor")({
  component: AgentEditorPage,
});

function AgentEditorPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorAgent = useEditorAgent({ editor });

  const diffCallbacksRef = useRef<{
    onAccept?: (suggestionId: string) => void;
    onReject?: (suggestionId: string) => void;
  }>({});

  const handleEditorReady = (editorInstance: Editor) => {
    setEditor(editorInstance);
  };

  const handleDiffAccept = useCallback((suggestionId: string) => {
    diffCallbacksRef.current.onAccept?.(suggestionId);
  }, []);

  const handleDiffReject = useCallback((suggestionId: string) => {
    diffCallbacksRef.current.onReject?.(suggestionId);
  }, []);

  return (
    <div className="h-screen p-4 bg-[#fbf7f2]">
      <div className="h-full flex gap-2 border border-[#ece4d8] bg-[#fdfaf6]">
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
