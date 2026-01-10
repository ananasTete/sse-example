"use client";

import { EventSourceExample } from './demo/event-source';
import { EventSourcePaserExample } from './demo/fetch-eventsource-paser';
import { ReadableStreamExample } from './demo/fetch-readableStream';



export default function Page() {

  return (
    <div className="flex justify-center items-center h-screen gap-5">
      <EventSourceExample />
      <ReadableStreamExample />
      <EventSourcePaserExample />
    </div>
  );
}
