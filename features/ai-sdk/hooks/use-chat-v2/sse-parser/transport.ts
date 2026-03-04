interface RecordValue {
  [key: string]: unknown;
}

export const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null;

export const normalizeTransportPayload = (
  transportEvent: string | undefined,
  parsed: unknown,
): unknown => {
  if (transportEvent === "delta" && isRecord(parsed)) {
    const op = parsed.o;
    const value = parsed.v;

    if (op === "add" && isRecord(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      let appendedText: string | null = null;
      let hasFinished = false;
      let finishReason = "stop";

      for (const item of value) {
        if (!isRecord(item)) continue;
        const path = typeof item.p === "string" ? item.p : "";
        const operation = typeof item.o === "string" ? item.o : "";
        const patchValue = item.v;

        if (
          path === "/message/content/parts/0" &&
          operation === "append" &&
          typeof patchValue === "string"
        ) {
          appendedText = (appendedText ?? "") + patchValue;
        }

        if (
          path === "/message/status" &&
          operation === "replace" &&
          patchValue === "finished_successfully"
        ) {
          hasFinished = true;
        }

        if (
          path === "/message/metadata" &&
          operation === "append" &&
          isRecord(patchValue) &&
          isRecord(patchValue.finish_details) &&
          typeof patchValue.finish_details.type === "string"
        ) {
          finishReason = patchValue.finish_details.type;
        }
      }

      if (appendedText) {
        return {
          type: "text-delta",
          delta: appendedText,
        };
      }

      if (hasFinished) {
        return {
          type: "finish",
          finishReason,
        };
      }
    }
  }

  if (isRecord(parsed) && isRecord(parsed.v) && typeof parsed.v.type === "string") {
    return parsed.v;
  }

  return parsed;
};
