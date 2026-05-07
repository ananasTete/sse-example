import { memo } from 'react'
import { type Editor } from '@tiptap/react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'
import { FloatingMenuLayer } from './floating-menu-layer'

interface AlignSelectProps {
  editor: Editor
  activeAlignId: AlignId
}

const alignOptions = [
  { id: 'left', label: 'Align left', icon: AlignLeft },
  { id: 'center', label: 'Align center', icon: AlignCenter },
  { id: 'right', label: 'Align right', icon: AlignRight },
] as const

export type AlignId = (typeof alignOptions)[number]['id']

export const AlignSelect = memo(function AlignSelect({
  editor,
  activeAlignId,
}: AlignSelectProps) {
  const {
    isOpen,
    setReference,
    setFloating,
    floatingStyles,
    context,
    getReferenceProps,
    getFloatingProps,
    close,
  } = useFloatingSelect({
    placement: 'bottom-start',
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
        <FloatingMenuLayer
          context={context}
          close={close}
          setFloating={setFloating}
          floatingStyles={floatingStyles}
          className="floating-select"
          floatingProps={getFloatingProps()}
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
        </FloatingMenuLayer>
      )}
    </>
  )
})
