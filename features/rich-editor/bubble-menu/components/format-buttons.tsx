import { memo } from 'react'
import { type Editor } from '@tiptap/react'
import { Bold, Code, Italic, Strikethrough, Underline } from 'lucide-react'

interface FormatButtonsProps {
  editor: Editor
  isBold: boolean
  isCode: boolean
  isItalic: boolean
  isStrike: boolean
  isUnderline: boolean
}

export const FormatButtons = memo(function FormatButtons({
  editor,
  isBold,
  isCode,
  isItalic,
  isStrike,
  isUnderline,
}: FormatButtonsProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={isBold ? 'is-active' : ''}
        title="Bold (⌘B)"
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={isCode ? 'is-active' : ''}
        title="Inline Code (⌘E)"
      >
        <Code size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={isItalic ? 'is-active' : ''}
        title="Italic (⌘I)"
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={isStrike ? 'is-active' : ''}
        title="Strikethrough (⌘⇧S)"
      >
        <Strikethrough size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={isUnderline ? 'is-active' : ''}
        title="Underline (⌘U)"
      >
        <Underline size={16} />
      </button>
    </>
  )
})
