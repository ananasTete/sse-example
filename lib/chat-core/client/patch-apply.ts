import type { ChatPatchOperation, MutationOp } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function resolveArrayIndex(array: unknown[], segment: string) {
  const index = segment === "-1" ? array.length - 1 : Number(segment);

  if (!Number.isInteger(index) || index < 0 || index >= array.length) {
    return null;
  }

  return index;
}

export function applyPathPatch(
  target: unknown,
  path: string,
  operation: ChatPatchOperation | MutationOp,
  value: unknown,
) {
  if (operation === "delete" && !path) return;

  const segments = path.split("/").filter(Boolean);
  let cursor = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    if (Array.isArray(cursor)) {
      const arrayIndex = resolveArrayIndex(cursor, segments[index]);
      if (arrayIndex === null) return;

      cursor = cursor[arrayIndex];
      continue;
    }

    if (!isRecord(cursor)) return;
    cursor = cursor[segments[index]];
  }

  const lastSegment = segments.at(-1);
  if (!lastSegment) return;

  if (Array.isArray(cursor)) {
    const arrayIndex = resolveArrayIndex(cursor, lastSegment);
    if (arrayIndex === null) return;

    if (
      (operation === "APPEND" || operation === "append") &&
      Array.isArray(cursor[arrayIndex])
    ) {
      (cursor[arrayIndex] as unknown[]).push(value);
      return;
    }

    cursor[arrayIndex] =
      (operation === "APPEND" || operation === "append") &&
      typeof cursor[arrayIndex] === "string"
        ? `${cursor[arrayIndex]}${String(value)}`
        : value;
    return;
  }

  if (!isRecord(cursor)) return;

  if (operation === "delete") {
    delete cursor[lastSegment];
    return;
  }

  if (operation === "APPEND" || operation === "append") {
    const currentValue = cursor[lastSegment];
    if (Array.isArray(currentValue)) {
      if (Array.isArray(value)) {
        currentValue.push(...value);
      } else {
        currentValue.push(value);
      }
      return;
    }

    if (typeof currentValue === "string") {
      cursor[lastSegment] = currentValue + String(value);
      return;
    }
  }

  cursor[lastSegment] = value;
}
