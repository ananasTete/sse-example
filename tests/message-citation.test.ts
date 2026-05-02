import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCitationMarkdownNodes,
  transformCitationTextNodes,
} from "@/src/components/ai-elements/message";

test("createCitationMarkdownNodes converts known citations to html tags", () => {
  assert.deepEqual(
    createCitationMarkdownNodes("DeepSeek[citation:1]", new Set([1])),
    [
      { type: "text", value: "DeepSeek" },
      { type: "html", value: '<citation cite_index="1">[1]</citation>' },
    ],
  );
});

test("createCitationMarkdownNodes keeps unknown citations as text", () => {
  assert.deepEqual(
    createCitationMarkdownNodes("DeepSeek[citation:99]", new Set([1])),
    [{ type: "text", value: "DeepSeek[citation:99]" }],
  );
});

test("createCitationMarkdownNodes converts adjacent known citations", () => {
  assert.deepEqual(
    createCitationMarkdownNodes("[citation:1][citation:2]", new Set([1, 2])),
    [
      { type: "html", value: '<citation cite_index="1">[1]</citation>' },
      { type: "html", value: '<citation cite_index="2">[2]</citation>' },
    ],
  );
});

test("transformCitationTextNodes skips link and code children", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "ok [citation:1]" },
          { type: "inlineCode", value: "[citation:1]" },
          {
            type: "link",
            url: "https://example.com",
            children: [{ type: "text", value: "[citation:1]" }],
          },
        ],
      },
      { type: "code", value: "[citation:1]" },
    ],
  };

  transformCitationTextNodes(tree, new Set([1]));

  assert.deepEqual(tree.children[0].children, [
    { type: "text", value: "ok " },
    { type: "html", value: '<citation cite_index="1">[1]</citation>' },
    { type: "inlineCode", value: "[citation:1]" },
    {
      type: "link",
      url: "https://example.com",
      children: [{ type: "text", value: "[citation:1]" }],
    },
  ]);
  assert.deepEqual(tree.children[1], { type: "code", value: "[citation:1]" });
});
