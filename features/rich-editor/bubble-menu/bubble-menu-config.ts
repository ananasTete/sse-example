import { type Editor } from "@tiptap/react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Code2,
  Quote,
  type LucideIcon,
} from "lucide-react";

interface NodeTypeOption {
  id: string;
  label: string;
  icon: LucideIcon;
  isActive: (editor: Editor) => boolean;
  command: (editor: Editor) => void;
}

export const nodeTypes = [
  {
    id: "paragraph",
    label: "Text",
    icon: Type,
    isActive: (editor) => editor.isActive("paragraph"),
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    id: "heading1",
    label: "Heading 1",
    icon: Heading1,
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 1 }).run();
    },
  },
  {
    id: "heading2",
    label: "Heading 2",
    icon: Heading2,
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 2 }).run();
    },
  },
  {
    id: "heading3",
    label: "Heading 3",
    icon: Heading3,
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 3 }).run();
    },
  },
  {
    id: "heading4",
    label: "Heading 4",
    icon: Heading4,
    isActive: (editor) => editor.isActive("heading", { level: 4 }),
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 4 }).run();
    },
  },
  {
    id: "heading5",
    label: "Heading 5",
    icon: Heading5,
    isActive: (editor) => editor.isActive("heading", { level: 5 }),
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 5 }).run();
    },
  },
  {
    id: "heading6",
    label: "Heading 6",
    icon: Heading6,
    isActive: (editor) => editor.isActive("heading", { level: 6 }),
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 6 }).run();
    },
  },
  {
    id: "bulletList",
    label: "Bulleted List",
    icon: List,
    isActive: (editor) => editor.isActive("bulletList"),
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "orderedList",
    label: "Ordered List",
    icon: ListOrdered,
    isActive: (editor) => editor.isActive("orderedList"),
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "codeBlock",
    label: "Code Block",
    icon: Code2,
    isActive: (editor) => editor.isActive("codeBlock"),
    command: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: "blockquote",
    label: "Quote",
    icon: Quote,
    isActive: (editor) => editor.isActive("blockquote"),
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
] as const satisfies readonly NodeTypeOption[];

export type NodeTypeId = (typeof nodeTypes)[number]["id"];

export function getActiveNodeTypeId(editor: Editor): NodeTypeId {
  return (
    nodeTypes
      .filter((nodeType) => nodeType.id !== "paragraph")
      .find((nodeType) => nodeType.isActive(editor))?.id ?? "paragraph"
  );
}

export function getNodeTypeById(typeId: NodeTypeId) {
  return (
    nodeTypes.find((nodeType) => nodeType.id === typeId) ?? nodeTypes[0]
  );
}

export function runNodeTypeCommand(editor: Editor, typeId: NodeTypeId) {
  getNodeTypeById(typeId).command(editor);
}
