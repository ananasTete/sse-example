import { memo } from 'react'
import { type Editor } from '@tiptap/react'
import { ChevronDown, Check } from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'
import { FloatingMenuLayer } from './floating-menu-layer'
import {
  getNodeTypeById,
  nodeTypes,
  runNodeTypeCommand,
  type NodeTypeId,
} from '../bubble-menu-config'

interface NodeTypeSelectProps {
  editor: Editor
  activeTypeId: NodeTypeId
}

export const NodeTypeSelect = memo(function NodeTypeSelect({
  editor,
  activeTypeId,
}: NodeTypeSelectProps) {
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
        <FloatingMenuLayer
          context={context}
          close={close}
          setFloating={setFloating}
          floatingStyles={floatingStyles}
          className="floating-select"
          floatingProps={getFloatingProps()}
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
        </FloatingMenuLayer>
      )}
    </>
  )
})
