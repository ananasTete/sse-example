import type {
  Node as ProseMirrorNode,
  Schema,
} from "@tiptap/pm/model";

function getHardBreakNode(schema: Schema) {
  return schema.nodes.hardBreak ?? schema.nodes.hard_break ?? null;
}

function createInlineContent(schema: Schema, text: string) {
  const hardBreak = getHardBreakNode(schema);

  if (!hardBreak || !text.includes("\n")) {
    return text ? [schema.text(text)] : undefined;
  }

  const content: ProseMirrorNode[] = [];
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    if (line) {
      content.push(schema.text(line));
    }
    if (index < lines.length - 1) {
      content.push(hardBreak.create());
    }
  });

  return content.length > 0 ? content : undefined;
}

export function createApplyEditReplacementNodes(
  schema: Schema,
  text: string,
) {
  return text
    .split(/\n{2,}/)
    .map((paragraphText) =>
      schema.nodes.paragraph.create(
        null,
        createInlineContent(schema, paragraphText),
      ),
    );
}
