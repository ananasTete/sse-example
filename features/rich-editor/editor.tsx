import { useEditor, EditorContent, Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
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
  <p>在这里开始输入内容...</p>
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
  scrollTarget?: HTMLElement | Window | null;
}

const TiptapEditor = ({
  initialContent,
  onEditorReady,
  onDocumentChange,
  scrollTarget,
}: TiptapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      SlashCommand,
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
      <BubbleMenu
        key={scrollTarget ? "custom-scroll-target" : "window-scroll-target"}
        editor={editor}
        scrollTarget={scrollTarget}
      />
      <SlashCommandMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

TiptapEditor.displayName = "TiptapEditor";

export default TiptapEditor;
