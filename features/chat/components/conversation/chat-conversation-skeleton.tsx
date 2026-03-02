export function ChatConversationSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f9f8f6] font-sans text-slate-800">
      <header className="sticky top-0 z-10 flex items-center justify-start bg-[#f9f8f6]/80 p-4 backdrop-blur-md">
        <div className="h-9 w-44 animate-pulse rounded-full bg-[#ebe6e0]" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 px-6 py-8">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-[24px] rounded-tr-lg bg-[#efede6] px-5 py-3.5">
              <div className="space-y-2">
                <div className="h-4 w-56 animate-pulse rounded bg-stone-300/55" />
                <div className="h-4 w-40 animate-pulse rounded bg-stone-300/45" />
              </div>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="w-full space-y-4 px-6 py-5">
              <div className="h-4 w-4/5 animate-pulse rounded bg-stone-300/40" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-stone-300/35" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-stone-300/30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
