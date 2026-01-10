import { type Editor } from '@tiptap/react'
import { FloatingPortal } from '@floating-ui/react'
import { MoreVertical, Copy, Trash2 } from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'

interface MoreMenuProps {
  editor: Editor
  placementDir?: 'top' | 'bottom'
  isBlockNode?: boolean
}

export function MoreMenu({
  editor,
  placementDir = 'bottom',
  isBlockNode = false,
}: MoreMenuProps) {
  const {
    isOpen,
    setReference,
    setFloating,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
    close,
  } = useFloatingSelect({ placement: `${placementDir}-end` })

  const handleCopy = () => {
    // If block node, we might want to copy node content?
    // Current logic: editor.state.doc.textBetween(from, to, '\n')
    // This works for NodeSelection too usually (gets text inside).
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, '\n')
    navigator.clipboard.writeText(text).then(() => {
      console.log('Text copied to clipboard')
    })
    close()
  }

  const handleDelete = () => {
    if (isBlockNode) {
      editor.commands.deleteSelection()
    } else {
      editor.chain().focus().deleteSelection().run()
    }
    close()
  }

  return (
    <>
      <button
        type="button"
        className="menu-button"
        ref={setReference}
        {...getReferenceProps()}
        title="More options"
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            className="floating-select more-menu"
            {...getFloatingProps()}
          >
            <button
              type="button"
              className="floating-select-item"
              onClick={handleCopy}
            >
              <Copy size={16} />
              <span>Copy</span>
            </button>
            <button
              type="button"
              className="floating-select-item delete-item"
              onClick={handleDelete}
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
