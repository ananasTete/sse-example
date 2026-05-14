import type { PatchOp, BatchItem } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function applyPathPatch(
  target: unknown,
  path: string,
  op: Exclude<PatchOp, "batch">,
  value: unknown,
) {
  const segments = path.split("/").filter(Boolean);

  // path="" means operate on root — support "set" to replace all properties
  if (segments.length === 0) {
    if (op === "set" && isRecord(target) && isRecord(value)) {
      for (const key of Object.keys(target)) delete (target as Record<string, unknown>)[key];
      Object.assign(target, value);
    }
    return;
  }

  let cursor = target;

  for (let i = 0; i < segments.length - 1; i++) {
    if (Array.isArray(cursor)) {
      const idx = Number(segments[i]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) return;
      cursor = cursor[idx];
    } else if (isRecord(cursor)) {
      cursor = cursor[segments[i]];
    } else {
      return;
    }
  }

  const last = segments.at(-1)!;

  if (Array.isArray(cursor)) {
    const idx = Number(last);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) return;

    if (op === "append" && typeof cursor[idx] === "string") {
      cursor[idx] = cursor[idx] + String(value);
    } else if (op === "add" && Array.isArray(cursor[idx])) {
      (cursor[idx] as unknown[]).push(value);
    } else if (op === "set") {
      cursor[idx] = value;
    }
    return;
  }

  if (!isRecord(cursor)) return;

  if (op === "add") {
    const arr = cursor[last];
    if (Array.isArray(arr)) {
      arr.push(value);
    }
    return;
  }

  if (op === "append") {
    const current = cursor[last];
    if (typeof current === "string") {
      cursor[last] = current + String(value);
    }
    return;
  }

  // op === "set"
  cursor[last] = value;
}
