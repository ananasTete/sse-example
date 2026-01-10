import { type Editor } from '@tiptap/react'
import { Bold, Code, Italic, Strikethrough, Underline } from 'lucide-react'
import { useEffect, useState } from 'react'

interface FormatButtonsProps {
  editor: Editor
}

export function FormatButtons({ editor }: FormatButtonsProps) {
  // Force re-render on editor state change to update active states
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const handler = () => forceUpdate({})

    // Listen to transaction to capture all state changes (selection, doc changes)
    editor.on('transaction', handler)
    editor.on('selectionUpdate', handler)

    return () => {
      editor.off('transaction', handler)
      editor.off('selectionUpdate', handler)
    }
  }, [editor])

  return (
    <>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="Bold (⌘B)"
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={editor.isActive('code') ? 'is-active' : ''}
        title="Inline Code (⌘E)"
      >
        <Code size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="Italic (⌘I)"
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="Strikethrough (⌘⇧S)"
      >
        <Strikethrough size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={editor.isActive('underline') ? 'is-active' : ''}
        title="Underline (⌘U)"
      >
        <Underline size={16} />
      </button>
    </>
  )
}
