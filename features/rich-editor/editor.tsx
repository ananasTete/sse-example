import { useEditor, EditorContent, Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { AISelectionHighlight } from "./extensions/ai-selection-highlight";
import {
  SelectionEndBoundary,
  SelectionStartBoundary,
} from "./extensions/ai-selection-boundary";
import { DiffBlock, DiffChange } from "./extensions/diff-block";
import { Underline } from "./extensions/underline";
import { SlashCommand } from "./extensions/slash-command";
import { BubbleMenu } from "./bubble-menu";
import { SlashCommandMenu } from "./slash-command";
import { useEffect } from "react";
import "./editor.css";

export const DEFAULT_EDITOR_CONTENT = `
  <h1>Welcome to Tiptap Editor</h1>
  <p>This is a <strong>rich text editor</strong> with a powerful <em>bubble menu</em>.</p>
  <p>Select some text to see the formatting options!</p>
  <h2>Features</h2>
  <ul>
    <li>Bold, Italic, Underline, Strikethrough</li>
    <li>Text color and background color</li>
    <li>Headings (H1-H6)</li>
    <li>Lists and blockquotes</li>
    <li>Text alignment</li>
  </ul>
  <blockquote>
    <p>This is a blockquote. It can contain multiple paragraphs.</p>
  </blockquote>
  <p>Try selecting this paragraph and applying some <code>formatting</code>!</p>
`;

export interface TiptapEditorRef {
  startStreamSession: (options?: {
    replaceSelection?: boolean;
  }) => Promise<AbortSignal | undefined>;
  write: (chunk: string) => void;
  abort: () => void;
  isStreaming: boolean;
  stopStream: () => void;
}

interface TiptapEditorProps {
  initialContent?: string | JSONContent;
  onEditorReady?: (editor: Editor) => void;
  onDocumentChange?: (snapshot: { raw: JSONContent; html: string }) => void;
}

const TiptapEditor = ({
  initialContent,
  onEditorReady,
  onDocumentChange,
}: TiptapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      SlashCommand,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
        defaultAlignment: "left",
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      AISelectionHighlight,
      SelectionStartBoundary,
      SelectionEndBoundary,
      DiffChange,
      DiffBlock,
    ],
    content: initialContent || DEFAULT_EDITOR_CONTENT || "",
    immediatelyRender: false,
  });

  // 当 editor 准备好时通知父组件
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || !onDocumentChange) return;

    let saveTimer: number | null = null;

    const handleUpdate = () => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }

      saveTimer = window.setTimeout(() => {
        onDocumentChange({
          raw: editor.getJSON(),
          html: editor.getHTML(),
        });
      }, 300);
    };

    editor.on("update", handleUpdate);

    return () => {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
      }
      editor.off("update", handleUpdate);
    };
  }, [editor, onDocumentChange]);

  if (!editor) {
    return null;
  }

  return (
    <div className="editor-container">
      <BubbleMenu editor={editor} />
      <SlashCommandMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

TiptapEditor.displayName = "TiptapEditor";

export default TiptapEditor;
