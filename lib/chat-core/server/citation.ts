export function normalizeCitationTags(value: string) {
  return value.replace(
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
  const OPEN = "<citation";
  const CLOSE = "</citation>";

  let pos = 0;

  while (pos < buffer.length) {
    const openIdx = buffer.indexOf(OPEN, pos);

    if (openIdx === -1) {
      for (let i = OPEN.length - 1; i >= 1; i -= 1) {
        if (buffer.endsWith(OPEN.slice(0, i))) {
          return {
            flush: normalizeCitationTags(buffer.slice(0, buffer.length - i)),
            hold: buffer.slice(buffer.length - i),
          };
        }
      }
      return { flush: normalizeCitationTags(buffer), hold: "" };
    }

    const closeIdx = buffer.indexOf(CLOSE, openIdx);
    if (closeIdx === -1) {
      return {
        flush: normalizeCitationTags(buffer.slice(0, openIdx)),
        hold: buffer.slice(openIdx),
      };
    }

    pos = closeIdx + CLOSE.length;
  }

  return { flush: normalizeCitationTags(buffer), hold: "" };
}
