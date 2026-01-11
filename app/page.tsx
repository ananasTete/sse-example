"use client";

import { ChatExample } from '@/features/ai-sdk/hooks/use-chat';



export default function Page() {

  return (
    <div className="flex justify-center items-center h-screen gap-5">
      <ChatExample />
    </div>
  );
}
