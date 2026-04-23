import { memo } from 'react'
import { type Editor } from '@tiptap/react'
import { FloatingPortal } from '@floating-ui/react'
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Code2,
  Quote,
  ChevronDown,
  Check,
} from 'lucide-react'
import { useFloatingSelect } from '../hooks/use-floating-select'

interface NodeTypeSelectProps {
  editor: Editor
  placementDir?: 'top' | 'bottom'
  activeTypeId: NodeTypeId
  onRequestPlacement?: () => void
}

const nodeTypes = [
  { id: 'paragraph', label: 'Text', icon: Type },
  { id: 'heading1', label: 'Heading 1', icon: Heading1 },
  { id: 'heading2', label: 'Heading 2', icon: Heading2 },
  { id: 'heading3', label: 'Heading 3', icon: Heading3 },
  { id: 'heading4', label: 'Heading 4', icon: Heading4 },
  { id: 'heading5', label: 'Heading 5', icon: Heading5 },
  { id: 'heading6', label: 'Heading 6', icon: Heading6 },
  { id: 'bulletList', label: 'Bulleted List', icon: List },
  { id: 'orderedList', label: 'Numbered List', icon: ListOrdered },
  { id: 'codeBlock', label: 'Code Block', icon: Code2 },
  { id: 'blockquote', label: 'Quote', icon: Quote },
] as const

export type NodeTypeId = (typeof nodeTypes)[number]['id']

const nodeTypeCommands: Record<NodeTypeId, (editor: Editor) => void> = {
  paragraph: (editor) => {
    editor.chain().focus().setParagraph().run()
  },
  heading1: (editor) => {
    editor.chain().focus().setHeading({ level: 1 }).run()
  },
  heading2: (editor) => {
    editor.chain().focus().setHeading({ level: 2 }).run()
  },
  heading3: (editor) => {
    editor.chain().focus().setHeading({ level: 3 }).run()
  },
  heading4: (editor) => {
    editor.chain().focus().setHeading({ level: 4 }).run()
  },
  heading5: (editor) => {
    editor.chain().focus().setHeading({ level: 5 }).run()
  },
  heading6: (editor) => {
    editor.chain().focus().setHeading({ level: 6 }).run()
  },
  bulletList: (editor) => {
    editor.chain().focus().toggleBulletList().run()
  },
  orderedList: (editor) => {
    editor.chain().focus().toggleOrderedList().run()
  },
  codeBlock: (editor) => {
    editor.chain().focus().toggleCodeBlock().run()
  },
  blockquote: (editor) => {
    editor.chain().focus().toggleBlockquote().run()
  },
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
    nodeTypeCommands[typeId](editor)
    close()
  }

  const activeOption =
    nodeTypes.find((t) => t.id === activeTypeId) ?? nodeTypes[0]

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
