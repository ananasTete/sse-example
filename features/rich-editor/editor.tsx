import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { AISelectionHighlight } from './extensions/ai-selection-highlight'
import { BubbleMenu } from './bubble-menu'
import './editor.css'

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
`

export interface TiptapEditorRef {
  startStreamSession: (options?: {
    replaceSelection?: boolean
  }) => Promise<AbortSignal | undefined>
  write: (chunk: string) => void
  abort: () => void
  isStreaming: boolean
  stopStream: () => void
}

interface TiptapEditorProps {
  initialContent?: string
}

const TiptapEditor = ({ initialContent }: TiptapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      AISelectionHighlight,
    ],
    content: initialContent || DEFAULT_EDITOR_CONTENT || '',
    immediatelyRender: false,
  })

  if (!editor) {
    return null
  }

  return (
    <div className="editor-container">
      <BubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

TiptapEditor.displayName = 'TiptapEditor'

export default TiptapEditor
