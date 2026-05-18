import assert from "node:assert/strict";
import { test } from "node:test";
import { schema } from "@tiptap/pm/schema-basic";
import { createApplyEditReplacementNodes } from "@/features/agent-editor/services/apply-edit-replacement";
import { locateParagraphSequence } from "@/features/agent-editor/services/locate-paragraph";

test("apply_edit replacement turns double newline into adjacent paragraphs", () => {
  const nodes = createApplyEditReplacementNodes(
    schema,
    "拿走拿走，别给我看这个！\n\n佟湘玉：干嘛呀这是？这不是挺帅的嘛。",
  );

  assert.equal(nodes.length, 2);
  assert.deepEqual(
    nodes.map((node) => node.textContent),
    [
      "拿走拿走，别给我看这个！",
      "佟湘玉：干嘛呀这是？这不是挺帅的嘛。",
    ],
  );
});

test("apply_edit replacement preserves single newline inside a paragraph", () => {
  const nodes = createApplyEditReplacementNodes(schema, "第一行\n第二行");

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].childCount, 3);
  assert.equal(nodes[0].child(0).textContent, "第一行");
  assert.equal(nodes[0].child(1).type.name, "hard_break");
  assert.equal(nodes[0].child(2).textContent, "第二行");
});

test("apply_edit can locate a multi-paragraph edit as one complete block range", () => {
  const first = schema.nodes.paragraph.create(null, schema.text("拿走拿走，拿走！"));
  const second = schema.nodes.paragraph.create(
    null,
    schema.text("佟湘玉：咋了吗这是？挺精神的呀。"),
  );
  const doc = schema.nodes.doc.create(null, [first, second]);

  assert.deepEqual(
    locateParagraphSequence(
      doc,
      "拿走拿走，拿走！\n\n佟湘玉：咋了吗这是？挺精神的呀。",
    ),
    { from: 0, to: first.nodeSize + second.nodeSize },
  );
});
