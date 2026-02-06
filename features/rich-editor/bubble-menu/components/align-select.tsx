import { type Editor } from '@tiptap/react'
import { FloatingPortal } from '@floating-ui/react'
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
  activeAlignId: AlignId
  onRequestPlacement?: () => void
}

const alignOptions = [
  { id: 'left', label: 'Align left', icon: AlignLeft },
  { id: 'center', label: 'Align center', icon: AlignCenter },
  { id: 'right', label: 'Align right', icon: AlignRight },
] as const

export type AlignId = (typeof alignOptions)[number]['id']

export function AlignSelect({
  editor,
  placementDir = 'bottom',
  activeAlignId,
  onRequestPlacement,
}: AlignSelectProps) {
  const {
    isOpen,
    setReference,
    setFloating,
    floatingStyles,
    getReferenceProps,
    getFloatingProps,
    close,
  } = useFloatingSelect({
    placement: `${placementDir}-start`,
    onOpen: onRequestPlacement,
  })

  const handleSelect = (alignId: AlignId) => {
    editor.chain().focus().setTextAlign(alignId).run()
    close()
  }

  const activeOption =
    alignOptions.find((o) => o.id === activeAlignId) ?? alignOptions[0]

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
