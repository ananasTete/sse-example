import { createFileRoute } from "@tanstack/react-router";
import PromptEditor from "@/features/prompt-editor/prompt-editor";

export const Route = createFileRoute("/prompt-editor")({
  component: PromptEditorPage,
});

function PromptEditorPage() {
  return (
    <div className="h-screen flex justify-center items-center">
      <PromptEditor />
    </div>
  );
}
