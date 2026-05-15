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
import {
  Action,
  Character,
  Dialogue,
  Scene,
  SceneHeading,
} from "./extensions/script-nodes";
import { BubbleMenu } from "./bubble-menu";
import { SlashCommandMenu } from "./slash-command";
import { useEffect } from "react";
import "./editor.css";

export const DEFAULT_EDITOR_CONTENT = `
  <scene-heading>1. 內景 教室 白天 小芸、阿良</scene-heading>
  <scene>一間寬敞明亮的教室，窗外陽光灑進來，照在學生的臉上。</scene>
  <action>小芸坐在窗邊，一邊寫著筆記，一邊偷看同學阿良。</action>
  <character style="text-align: center;">小芸:</character>
  <dialogue style="text-align: center;">你昨天有唸書嗎？</dialogue>
  <character style="text-align: center;">阿良:</character>
  <dialogue style="text-align: center;">沒有耶，我昨天打電動到半夜……</dialogue>
  <action>小芸翻了個白眼，繼續低頭寫筆記。</action>
  <action>阿良趁機把手機藏在課本後面，繼續玩著手遊。</action>
  <scene-heading>2. 外景 公園 下午 小芸、阿良</scene-heading>
  <scene>陽光透過樹葉灑在長椅上，風吹過來帶著微微的涼意。</scene>
  <action>小芸坐在長椅上吃著冰淇淋，表情放鬆。</action>
  <action>阿良慢慢走近，手上拿著兩瓶飲料。</action>
  <character style="text-align: center;">阿良:</character>
  <dialogue style="text-align: center;">你怎麼一個人跑來公園？</dialogue>
  <character style="text-align: center;">小芸:</character>
  <dialogue style="text-align: center;">想一個人靜靜，結果還是被你找到了。</dialogue>
  <action>兩人相視而笑，氣氛輕鬆。</action>
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
      SceneHeading,
      Scene,
      Action,
      Character,
      Dialogue,
      TextAlign.configure({
        types: [
          "heading",
          "paragraph",
          "sceneHeading",
          "scene",
          "action",
          "character",
          "dialogue",
        ],
        alignments: ["left", "center", "right"],
        defaultAlignment: null,
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
