import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_EDITOR_SYSTEM_PROMPT } from "@/src/server/agent-editor-chat/prompts";

test("agent editor prompt includes script formatting rules", () => {
  assert.match(AGENT_EDITOR_SYSTEM_PROMPT, /## 剧本格式规范/);
  assert.match(AGENT_EDITOR_SYSTEM_PROMPT, /场次行使用 `【】`/);
  assert.match(AGENT_EDITOR_SYSTEM_PROMPT, /包含位置和时间/);
  assert.match(AGENT_EDITOR_SYSTEM_PROMPT, /角色：台词/);
  assert.match(AGENT_EDITOR_SYSTEM_PROMPT, /（动作或神态）/);
  assert.match(AGENT_EDITOR_SYSTEM_PROMPT, /动作、场景、调度、气氛描述可以单独成行/);
});
