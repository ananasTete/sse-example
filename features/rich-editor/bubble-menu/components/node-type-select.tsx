import { memo } from 'react'
import { type Editor } from '@tiptap/react'
import { FloatingPortal } from '@floating-ui/react'
import { ChevronDown, Check } from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'
import {
  getNodeTypeById,
  nodeTypes,
  runNodeTypeCommand,
  type NodeTypeId,
} from '../bubble-menu-config'

interface NodeTypeSelectProps {
  editor: Editor
  placementDir?: 'top' | 'bottom'
  activeTypeId: NodeTypeId
  onRequestPlacement?: () => void
}

export const NodeTypeSelect = memo(function NodeTypeSelect({
  editor,
  placementDir = 'bottom',
  activeTypeId,
  onRequestPlacement,
}: NodeTypeSelectProps) {
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

  const handleSelect = (typeId: NodeTypeId) => {
    runNodeTypeCommand(editor, typeId)
    close()
  }

  const activeOption = getNodeTypeById(activeTypeId)

  return (
    <>
      <button
        type="button"
        className="select-trigger"
        ref={setReference}
        {...getReferenceProps()}
        title="Node Type"
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
            {nodeTypes.map((nodeType) => {
              const Icon = nodeType.icon
              const isActive = activeTypeId === nodeType.id
              return (
                <button
                  key={nodeType.id}
                  type="button"
                  className={`floating-select-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleSelect(nodeType.id)}
                >
                  <Icon size={16} />
                  <span>{nodeType.label}</span>
                  {isActive && <Check size={14} className="check-icon" />}
                </button>
              )
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  )
})
