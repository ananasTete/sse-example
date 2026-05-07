import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import TiptapEditor from "@/features/rich-editor/editor";
import {
  AgentChat,
  type AgentChatHandle,
} from "@/features/agent-editor/components/agent-chat";
import { useEditorAgent } from "@/features/agent-editor/hooks/use-editor-agent";
import { ErrorBoundary } from "@/features/agent-editor/components/error-boundary";
import {
  loadAgentEditorDocument,
  saveAgentEditorDocument,
} from "@/features/agent-editor/services/document-storage";

export const Route = createFileRoute("/agent-editor")({
  component: AgentEditorPage,
});

function AgentEditorPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const agentChatRef = useRef<AgentChatHandle>(null);
  const [editorScrollElement, setEditorScrollElement] =
    useState<HTMLDivElement | null>(null);
  const [initialContent] = useState(
    () => loadAgentEditorDocument()?.raw,
  );
  const editorAgent = useEditorAgent({ editor });

  const handleEditorReady = (editorInstance: Editor) => {
    setEditor(editorInstance);
  };

  const handleSelectionAISubmit = useCallback((prompt: string) => {
    return agentChatRef.current?.submitFromSelectionPanel(prompt) ?? false;
  }, []);

  return (
    <div className="h-screen p-4 bg-[#fbf7f2]">
      <div className="h-full flex gap-2 border border-[#ece4d8] bg-[#fdfaf6]">
        <div
          ref={setEditorScrollElement}
          className="rounded-sm flex-1 overflow-auto bg-white shadow-[0_1px_0_rgba(63,53,45,0.05)]"
        >
          <div className="w-200 mx-auto">
            <ErrorBoundary>
              <TiptapEditor
                initialContent={initialContent}
                onEditorReady={handleEditorReady}
                onDocumentChange={saveAgentEditorDocument}
                scrollTarget={editorScrollElement}
                onSelectionAISubmit={handleSelectionAISubmit}
              />
            </ErrorBoundary>
          </div>
        </div>

        <div className="rounded-sm w-150 overflow-hidden">
          <ErrorBoundary>
            <AgentChat ref={agentChatRef} editorAgent={editorAgent} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
