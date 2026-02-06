import { type Editor } from '@tiptap/react'
import { Bold, Code, Italic, Strikethrough, Underline } from 'lucide-react'

interface FormatButtonsProps {
  editor: Editor
  active: {
    bold: boolean
    code: boolean
    italic: boolean
    strike: boolean
    underline: boolean
  }
}

export function FormatButtons({ editor, active }: FormatButtonsProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={active.bold ? 'is-active' : ''}
        title="Bold (⌘B)"
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={active.code ? 'is-active' : ''}
        title="Inline Code (⌘E)"
      >
        <Code size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={active.italic ? 'is-active' : ''}
        title="Italic (⌘I)"
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={active.strike ? 'is-active' : ''}
        title="Strikethrough (⌘⇧S)"
      >
        <Strikethrough size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={active.underline ? 'is-active' : ''}
        title="Underline (⌘U)"
      >
        <Underline size={16} />
      </button>
    </>
  )
}
