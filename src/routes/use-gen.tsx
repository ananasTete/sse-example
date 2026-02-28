import { createFileRoute } from "@tanstack/react-router";
import { EventSourcePaserExample } from "@/features/ai-sdk/hooks/use-generation/demo";

export const Route = createFileRoute("/use-gen")({
  component: UseGenPage,
});

function UseGenPage() {
  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <div className="flex justify-center gap-6">
        <EventSourcePaserExample />
      </div>
    </div>
  );
}
