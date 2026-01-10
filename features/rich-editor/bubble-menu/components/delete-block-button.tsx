import { type Editor } from '@tiptap/react'
import { Trash2 } from 'lucide-react'

interface DeleteBlockButtonProps {
  editor: Editor
}

export function DeleteBlockButton({ editor }: DeleteBlockButtonProps) {
  const handleClick = () => {
    editor.commands.deleteSelection()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="delete-button"
      title="Delete block"
      style={{ color: '#ef4444' }} // Red color for danger action
    >
      <Trash2 size={16} />
    </button>
  )
}
