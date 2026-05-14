function normalizeCitationClosingTags(value: string) {
  return value.replace(
    /(<citation\b[^>]*>[\s\S]*?)<\/caption>/g,
    "$1</citation>",
  );
}

export function normalizeCitationTags(value: string) {
  return normalizeCitationClosingTags(value).replace(
    /<citation\b([^>]*)>([\s\S]*?)<\/citation>/g,
    (raw, attributes: string, children: string) => {
      const attributeMatch = attributes.match(
        /\b(?:cite_index|cite)=["']?(\d+)["']?/,
      );
      const childMatch = children.match(/\d+/);
      const citeIndex = attributeMatch?.[1] ?? childMatch?.[0];
      return citeIndex
        ? `<citation cite_index="${citeIndex}">${children}</citation>`
        : raw;
    },
  );
}

export function extractFlushableCitationMarkdown(buffer: string): {
  flush: string;
  hold: string;
} {
  const normalizedBuffer = normalizeCitationClosingTags(buffer);
  const OPEN = "<citation";
  const CLOSE = "</citation>";

  let pos = 0;

  while (pos < normalizedBuffer.length) {
    const openIdx = normalizedBuffer.indexOf(OPEN, pos);

    if (openIdx === -1) {
      for (let i = OPEN.length - 1; i >= 1; i -= 1) {
        if (normalizedBuffer.endsWith(OPEN.slice(0, i))) {
          return {
            flush: normalizeCitationTags(
              normalizedBuffer.slice(0, normalizedBuffer.length - i),
            ),
            hold: normalizedBuffer.slice(normalizedBuffer.length - i),
          };
        }
      }
      return { flush: normalizeCitationTags(normalizedBuffer), hold: "" };
    }

    const closeIdx = normalizedBuffer.indexOf(CLOSE, openIdx);
    if (closeIdx === -1) {
      return {
        flush: normalizeCitationTags(normalizedBuffer.slice(0, openIdx)),
        hold: normalizedBuffer.slice(openIdx),
      };
    }

    pos = closeIdx + CLOSE.length;
  }

  return { flush: normalizeCitationTags(normalizedBuffer), hold: "" };
}
