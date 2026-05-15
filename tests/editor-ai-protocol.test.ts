import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSelectionText } from "@/src/server/chat/editor-ai-protocol";

test("extractSelectionText reads selection inside a script dialogue node", () => {
  const contentWithSelection = [
    "<character>小芸</character>",
    "<dialogue>你昨天有<selection-start></selection-start>唸書嗎？<selection-end></selection-end></dialogue>",
  ].join("");

  assert.equal(extractSelectionText(contentWithSelection), "唸書嗎？");
});

test("extractSelectionText preserves paragraphs across script nodes", () => {
  const contentWithSelection = [
    "<dialogue>你昨天有<selection-start></selection-start>唸書嗎？</dialogue>",
    "<action>小芸翻了個白眼，繼續低頭<selection-end></selection-end>寫筆記。</action>",
  ].join("");

  assert.equal(
    extractSelectionText(contentWithSelection),
    "唸書嗎？\n\n小芸翻了個白眼，繼續低頭",
  );
});
