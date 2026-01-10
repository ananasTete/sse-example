import { type Editor } from '@tiptap/react'
import { FloatingPortal } from '@floating-ui/react'
import { useEffect, useState } from 'react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'

interface AlignSelectProps {
  editor: Editor
  placementDir?: 'top' | 'bottom'
}

const alignOptions = [
  { id: 'left', label: 'Align left', icon: AlignLeft },
  { id: 'center', label: 'Align center', icon: AlignCenter },
  { id: 'right', label: 'Align right', icon: AlignRight },
] as const

type AlignId = (typeof alignOptions)[number]['id']

function getActiveAlign(editor: Editor): AlignId {
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  return 'left'
}

function getActiveAlignOption(editor: Editor) {
  const activeAlign = getActiveAlign(editor)
  return alignOptions.find((o) => o.id === activeAlign) ?? alignOptions[0]
}

export function AlignSelect({
  editor,
  placementDir = 'bottom',
}: AlignSelectProps) {
  const {
    isOpen,
    setReference,
    setFloating,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
    close,
  } = useFloatingSelect({ placement: `${placementDir}-start` })

  // Force re-render on editor state change
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const handler = () => forceUpdate({})
    editor.on('transaction', handler)
    editor.on('selectionUpdate', handler)
    return () => {
      editor.off('transaction', handler)
      editor.off('selectionUpdate', handler)
    }
  }, [editor])

  const handleSelect = (alignId: AlignId) => {
    editor.chain().focus().setTextAlign(alignId).run()
    close()
  }

  const activeOption = getActiveAlignOption(editor)
  const activeAlignId = activeOption.id

  return (
    <>
      <button
        type="button"
        className="select-trigger"
        ref={setReference}
        {...getReferenceProps()}
        title="Text Alignment"
      >
        <activeOption.icon size={16} />
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            className="floating-select"
            {...getFloatingProps()}
          >
            {alignOptions.map((option) => {
              const Icon = option.icon
              const isActive = activeAlignId === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`floating-select-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleSelect(option.id)}
                >
                  <Icon size={16} />
                  <span>{option.label}</span>
                  {isActive && <Check size={14} className="check-icon" />}
                </button>
              )
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
