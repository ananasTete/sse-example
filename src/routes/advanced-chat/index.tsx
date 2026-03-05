import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/advanced-chat/")({
  component: AdvancedChatStandaloneCreator,
});

function AdvancedChatStandaloneCreator() {
  const navigate = useNavigate({ from: "/advanced-chat/" });

  useEffect(() => {
    fetch("/api/advanced-chat", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        navigate({
          to: "/advanced-chat/$chatId",
          params: { chatId: data.id },
          replace: true,
        });
      })
      .catch(console.error);
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#f9f8f6] font-sans text-slate-500">
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
          <Sparkles className="h-10 w-10 animate-pulse text-indigo-500" />
        </div>
        <p className="font-medium tracking-tight">
          Creating pristine conversation space...
        </p>
      </div>
    </div>
  );
}
