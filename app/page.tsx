"use client";

import TiptapEditor from '@/features/rich-editor/editor';
import { EventSourceExample } from '../features/ai-sdk/demo/event-source';
import { EventSourcePaserExample } from '../features/ai-sdk/demo/fetch-eventsource-paser';
import { ReadableStreamExample } from '../features/ai-sdk/demo/fetch-readableStream';



export default function Page() {

  return (
    <div className="flex justify-center items-center h-screen gap-5">
      <EventSourceExample />
      <ReadableStreamExample />
      <EventSourcePaserExample />

      <TiptapEditor />
    </div>
  );
}
