import { Node, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

type ScriptNodeConfig = {
  name: string;
  tag: string;
  nextNode: string;
};

export function getScriptNodeDefaultAttributes(nodeName: string) {
  if (nodeName === "character" || nodeName === "dialogue") {
    return { textAlign: "center" };
  }

  return {};
}

function ensureCharacterColon(editor: Editor) {
  const { state, view } = editor;
  const { $from } = state.selection;
  const parent = $from.parent;

  if (/[:：]\s*$/.test(parent.textContent)) return;

  const insertPos = $from.end();
  const tr = state.tr.insertText(":", insertPos);
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  view.dispatch(tr);
}

function omitDefaultCenterStyle(
  nodeName: string,
  HTMLAttributes: Record<string, unknown>,
) {
  if (nodeName !== "character" && nodeName !== "dialogue") {
    return HTMLAttributes;
  }

  const style = HTMLAttributes.style;
  if (typeof style !== "string") return HTMLAttributes;

  const styles = style
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !/^text-align:\s*center$/i.test(item));

  if (styles.length > 0) {
    return { ...HTMLAttributes, style: styles.join("; ") };
  }

  const rest = { ...HTMLAttributes };
  delete rest.style;
  return rest;
}

function createScriptBlockNode({
  name,
  tag,
  nextNode,
}: ScriptNodeConfig) {
  return Node.create({
    name,
    group: "block",
    content: "inline*",

    parseHTML() {
      return [{ tag }];
    },

    renderHTML({ HTMLAttributes: nodeHTMLAttributes }) {
      return [tag, omitDefaultCenterStyle(name, nodeHTMLAttributes), 0];
    },

    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          if (!editor.isActive(this.name)) return false;
          if (this.name === "character") {
            ensureCharacterColon(editor);
          }

          return editor
            .chain()
            .splitBlock()
            .setNode(nextNode, getScriptNodeDefaultAttributes(nextNode))
            .run();
        },
      };
    },
  });
}

export const SceneHeading = createScriptBlockNode({
  name: "sceneHeading",
  tag: "scene-heading",
  nextNode: "scene",
});

export const Scene = createScriptBlockNode({
  name: "scene",
  tag: "scene",
  nextNode: "action",
});

export const Action = createScriptBlockNode({
  name: "action",
  tag: "action",
  nextNode: "action",
});

export const Character = createScriptBlockNode({
  name: "character",
  tag: "character",
  nextNode: "dialogue",
});

export const Dialogue = createScriptBlockNode({
  name: "dialogue",
  tag: "dialogue",
  nextNode: "action",
});
