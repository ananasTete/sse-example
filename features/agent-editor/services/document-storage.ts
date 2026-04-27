import type { JSONContent } from "@tiptap/core";

const AGENT_EDITOR_DOCUMENT_KEY = "agent-editor:document:v1";

export interface AgentEditorDocumentSnapshot {
  schemaVersion: 1;
  raw: JSONContent;
  html: string;
  savedAt: string;
}

export function saveAgentEditorDocument(input: {
  raw: JSONContent;
  html: string;
}): AgentEditorDocumentSnapshot {
  const snapshot: AgentEditorDocumentSnapshot = {
    schemaVersion: 1,
    raw: input.raw,
    html: input.html,
    savedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      AGENT_EDITOR_DOCUMENT_KEY,
      JSON.stringify(snapshot),
    );
  }

  return snapshot;
}

export function loadAgentEditorDocument(): AgentEditorDocumentSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const rawSnapshot = window.localStorage.getItem(AGENT_EDITOR_DOCUMENT_KEY);
    if (!rawSnapshot) return null;

    const snapshot = JSON.parse(
      rawSnapshot,
    ) as Partial<AgentEditorDocumentSnapshot>;

    if (
      snapshot.schemaVersion !== 1 ||
      !snapshot.raw ||
      typeof snapshot.raw !== "object" ||
      typeof snapshot.html !== "string" ||
      typeof snapshot.savedAt !== "string"
    ) {
      return null;
    }

    return snapshot as AgentEditorDocumentSnapshot;
  } catch (error) {
    console.warn("Failed to load agent editor document snapshot", error);
    return null;
  }
}
