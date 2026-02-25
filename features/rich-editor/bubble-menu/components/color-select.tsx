import { type Editor } from '@tiptap/react'
import { FloatingPortal } from '@floating-ui/react'
import { Palette, ChevronDown, Check } from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'

interface ColorSelectProps {
  editor: Editor
  placementDir?: 'top' | 'bottom'
  activeTextColor: string | null
  activeHighlight: string | null
  onRequestPlacement?: () => void
}

const textColors = [
  { id: 'default', label: 'Default Color', color: null },
  { id: 'red', label: 'Red', color: '#ef4444' },
  { id: 'orange', label: 'Orange', color: '#f97316' },
  { id: 'yellow', label: 'Yellow', color: '#eab308' },
  { id: 'green', label: 'Green', color: '#22c55e' },
  { id: 'teal', label: 'Teal', color: '#14b8a6' },
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'purple', label: 'Purple', color: '#a855f7' },
  { id: 'grey', label: 'Grey', color: '#6b7280' },
] as const

const backgroundColors = [
  { id: 'default-bg', label: 'Default Background', color: null },
  { id: 'red-bg', label: 'Red', color: '#fecaca' },
  { id: 'orange-bg', label: 'Orange', color: '#fed7aa' },
  { id: 'yellow-bg', label: 'Yellow', color: '#fef08a' },
  { id: 'green-bg', label: 'Green', color: '#bbf7d0' },
  { id: 'teal-bg', label: 'Teal', color: '#99f6e4' },
  { id: 'blue-bg', label: 'Blue', color: '#bfdbfe' },
  { id: 'purple-bg', label: 'Purple', color: '#e9d5ff' },
  { id: 'grey-bg', label: 'Grey', color: '#e5e7eb' },
] as const

export function ColorSelect({
  editor,
  placementDir = 'bottom',
  activeTextColor,
  activeHighlight,
  onRequestPlacement,
}: ColorSelectProps) {
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

  const handleTextColorSelect = (color: string | null) => {
    if (color === null) {
      editor.chain().focus().unsetColor().run()
    } else {
      editor.chain().focus().setColor(color).run()
    }
    close()
  }

  const handleBackgroundColorSelect = (color: string | null) => {
    if (color === null) {
      editor.chain().focus().unsetHighlight().run()
    } else {
      editor.chain().focus().setHighlight({ color }).run()
    }
    close()
  }

  return (
    <>
      <button
        type="button"
        className="select-trigger"
        ref={setReference}
        {...getReferenceProps()}
        title="Text & Background Color"
      >
        <Palette size={16} />
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            className="floating-select color-select"
            {...getFloatingProps()}
          >
            {/* Text Color Section */}
            <div className="color-section-label">Color</div>
            {textColors.map((item) => {
              const isActive = item.color === activeTextColor
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`floating-select-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleTextColorSelect(item.color)}
                >
                  <span
                    className="color-indicator"
                    style={{
                      backgroundColor: item.color ?? 'transparent',
                      color: item.color ?? '#374151',
                    }}
                  >
                    A
                  </span>
                  <span>{item.label}</span>
                  {isActive && <Check size={14} className="check-icon" />}
                </button>
              )
            })}

            {/* Background Color Section */}
            <div className="color-section-label">Background</div>
            {backgroundColors.map((item) => {
              const isActive = item.color === activeHighlight
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`floating-select-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleBackgroundColorSelect(item.color)}
                >
                  <span
                    className="color-indicator has-bg"
                    style={{
                      backgroundColor: item.color ?? 'transparent',
                    }}
                  >
                    A
                  </span>
                  <span>{item.label}</span>
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
