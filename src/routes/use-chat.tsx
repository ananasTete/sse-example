import { createFileRoute } from "@tanstack/react-router";
import { UseChatHookDemo } from "@/features/ai-sdk/hooks/use-chat/demo";

export const Route = createFileRoute("/use-chat")({
  component: UseChatPage,
});

function UseChatPage() {
  return (
    <div className="min-h-screen bg-stone-100 p-4 md:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            useChat Hook Demo
          </h1>
          <p className="text-sm text-stone-600">
            用于验证 `features/ai-sdk/hooks/use-chat/index.ts` 的交互和流式行为。
          </p>
        </header>
        <UseChatHookDemo />
      </div>
    </div>
  );
}
