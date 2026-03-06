import { createFileRoute } from "@tanstack/react-router";
import PromptEditor from "@/features/prompt-editor/prompt-editor";

export const Route = createFileRoute("/prompt-editor")({
  component: PromptEditorPage,
});

function PromptEditorPage() {
  return (
    <div className="h-screen overflow-hidden bg-white p-3">
      <PromptEditor />
    </div>
  );
}
