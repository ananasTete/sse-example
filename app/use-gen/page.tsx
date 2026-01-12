"use client";

import {
  EventSourceExample,
  EventSourcePaserExample,
  ReadableStreamExample,
} from "@/features/ai-sdk/hooks/use-generation/demo";

export default function UseGenPage() {
  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <h1 className="text-2xl font-bold mb-6">SSE 流式数据处理示例</h1>
      <div className="flex justify-center gap-6">
        <EventSourceExample />
        <ReadableStreamExample />
        <EventSourcePaserExample />
      </div>
    </div>
  );
}
