"use client";

import { Wrench } from "lucide-react";
import type { CoreFragment } from "../types";

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function GenericToolView({ fragment }: { fragment: CoreFragment }) {
  const input = stringify(fragment.tool_input);
  const output = stringify(fragment.tool_output);

  return (
    <details className="mb-4 rounded-lg border border-[#dedbd2] bg-[#f8f7f2] px-3 py-2.5 text-sm text-[#3f3b34]">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <Wrench className="size-4 text-[#726756]" />
        <span>{fragment.tool_name ?? "tool"}</span>
        {fragment.status ? (
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-[#746f65]">
            {fragment.status}
          </span>
        ) : null}
      </summary>

      {input ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-white p-2 text-xs leading-5 text-[#3f3b34]">
          {input}
        </pre>
      ) : null}

      {output ? (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-white p-2 text-xs leading-5 text-[#3f3b34]">
          {output}
        </pre>
      ) : null}
    </details>
  );
}
