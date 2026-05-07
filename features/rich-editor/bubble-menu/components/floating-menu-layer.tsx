import {
  FloatingFocusManager,
  FloatingPortal,
  type FloatingContext,
} from '@floating-ui/react'
import {
  useEffect,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type UIEvent,
} from 'react'

const pageScrollKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
])

interface FloatingMenuLayerProps {
  context: FloatingContext
  close: () => void
  setFloating: (node: HTMLElement | null) => void
  floatingStyles: CSSProperties
  className: string
  floatingProps?: HTMLAttributes<HTMLElement>
  children: ReactNode
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

function useBlockPageScrollKeys() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target) ||
        !pageScrollKeys.has(event.key)
      ) {
        return
      }

      event.preventDefault()
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])
}

function preventScroll(event: UIEvent) {
  event.preventDefault()
}

export function FloatingMenuLayer({
  context,
  close,
  setFloating,
  floatingStyles,
  className,
  floatingProps,
  children,
}: FloatingMenuLayerProps) {
  useBlockPageScrollKeys()

  return (
    <FloatingPortal>
      <div
        aria-hidden="true"
        className="floating-select-overlay"
        onClick={close}
        onWheel={preventScroll}
        onTouchMove={preventScroll}
      />
      <FloatingFocusManager context={context} modal initialFocus={0} returnFocus>
        <div
          ref={setFloating}
          style={floatingStyles}
          className={className}
          {...floatingProps}
        >
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}
