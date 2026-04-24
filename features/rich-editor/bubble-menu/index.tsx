import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'
import { isNodeSelection } from '@tiptap/core'
import { type Editor, useEditorState } from '@tiptap/react'
import type { Transaction } from '@tiptap/pm/state'
import { useEffect, useState, useCallback, useRef } from 'react'

import { AIButton } from './components/ai-button'
import {
  AIFloatingPanel,
  type AIPanelClosePayload,
} from './components/ai-floating-panel'
import './bubble-menu.css'
import { Divider } from './components/divider'
import { NodeTypeSelect, type NodeTypeId } from './components/node-type-select'
import { AlignSelect, type AlignId } from './components/align-select'
import { ColorSelect } from './components/color-select'
import { MoreMenu } from './components/more-menu'
import { FormatButtons } from './components/format-buttons'
import {
  resolveSavedSelection,
  type SavedSelection,
} from './selection'

interface BubbleMenuProps {
  editor: Editor
}

const nodeTypeMatchers: Array<{
  id: NodeTypeId
  isActive: (editor: Editor) => boolean
}> = [
  { id: 'heading1', isActive: (editor) => editor.isActive('heading', { level: 1 }) },
  { id: 'heading2', isActive: (editor) => editor.isActive('heading', { level: 2 }) },
  { id: 'heading3', isActive: (editor) => editor.isActive('heading', { level: 3 }) },
  { id: 'heading4', isActive: (editor) => editor.isActive('heading', { level: 4 }) },
  { id: 'heading5', isActive: (editor) => editor.isActive('heading', { level: 5 }) },
  { id: 'heading6', isActive: (editor) => editor.isActive('heading', { level: 6 }) },
  { id: 'bulletList', isActive: (editor) => editor.isActive('bulletList') },
  { id: 'orderedList', isActive: (editor) => editor.isActive('orderedList') },
  { id: 'codeBlock', isActive: (editor) => editor.isActive('codeBlock') },
  { id: 'blockquote', isActive: (editor) => editor.isActive('blockquote') },
]

const alignMatchers: Array<{
  id: AlignId
  isActive: (editor: Editor) => boolean
}> = [
  { id: 'center', isActive: (editor) => editor.isActive({ textAlign: 'center' }) },
  { id: 'right', isActive: (editor) => editor.isActive({ textAlign: 'right' }) },
]

function getActiveNodeTypeId(editor: Editor): NodeTypeId {
  return nodeTypeMatchers.find((item) => item.isActive(editor))?.id ?? 'paragraph'
}

function getActiveAlignId(editor: Editor): AlignId {
  return alignMatchers.find((item) => item.isActive(editor))?.id ?? 'left'
}

export function BubbleMenu({ editor }: BubbleMenuProps) {
  const [placementDir, setPlacementDir] = useState<'top' | 'bottom'>('bottom')
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [savedSelection, setSavedSelection] = useState<SavedSelection | null>(null)
  const prevEditableRef = useRef<boolean | null>(null)

  const ui = useEditorState({
    editor,
    selector: ({ editor }) => {
      const selection = editor.state.selection

      const textColor = editor.getAttributes('textStyle').color || null
      const highlightColor = editor.getAttributes('highlight').color || null

      return {
        selectionEmpty: selection.empty,
        isNodeSelection: isNodeSelection(selection),
        nodeTypeId: getActiveNodeTypeId(editor),
        alignId: getActiveAlignId(editor),
        textColor,
        highlightColor,
        isBold: editor.isActive('bold'),
        isCode: editor.isActive('code'),
        isItalic: editor.isActive('italic'),
        isStrike: editor.isActive('strike'),
        isUnderline: editor.isActive('underline'),
      }
    },
  })

  const requestDropdownPlacement = useCallback(() => {
    const { selection } = editor.state
    if (isNodeSelection(selection) || selection.empty) return

    // Use a conservative max dropdown height so all dropdowns share the same direction.
    // ColorSelect can be up to ~400px, plus padding and offset.
    const MAX_PANEL_HEIGHT = 420
    const VIEWPORT_PADDING = 16

    const coords = editor.view.coordsAtPos(selection.from)
    const availableBottom = window.innerHeight - coords.bottom
    const needsOpenUp =
      availableBottom < MAX_PANEL_HEIGHT + VIEWPORT_PADDING

    setPlacementDir(needsOpenUp ? 'top' : 'bottom')
  }, [editor])

  // AI 面板打开期间锁定编辑器，避免选区/位置在替换前发生漂移
  useEffect(() => {
    if (showAIPanel) {
      if (prevEditableRef.current === null) {
        prevEditableRef.current = editor.isEditable
      }
      editor.setEditable(false)
    } else {
      if (prevEditableRef.current !== null) {
        editor.setEditable(prevEditableRef.current)
        prevEditableRef.current = null
      }
    }

    return () => {
      if (prevEditableRef.current !== null) {
        editor.setEditable(prevEditableRef.current)
        prevEditableRef.current = null
      }
    }
  }, [showAIPanel, editor])

  useEffect(() => {
    if (!showAIPanel) return

    const handleTransaction = ({
      transaction,
    }: {
      transaction: Transaction
    }) => {
      if (!transaction.docChanged) return

      setSavedSelection((selection) => {
        if (!selection) return selection

        return {
          ...selection,
          bookmark: selection.bookmark.map(transaction.mapping),
        }
      })
    }

    editor.on('transaction', handleTransaction)

    return () => {
      editor.off('transaction', handleTransaction)
    }
  }, [editor, showAIPanel])

  // 当 AI 面板显示时，在编辑器容器上添加类名，配合 CSS 隐藏原生选区
  useEffect(() => {
    if (showAIPanel) {
      editor.view.dom.classList.add('ai-panel-active')
    } else {
      editor.view.dom.classList.remove('ai-panel-active')
    }
    
    return () => {
      editor.view.dom.classList.remove('ai-panel-active')
    }
  }, [showAIPanel, editor])

  const clearAIPanelState = useCallback(
    (caretPos?: number) => {
      if (typeof caretPos === 'number') {
        editor.commands.setTextSelection(caretPos)
      }

      editor.commands.clearAISelectionHighlight()
      setSavedSelection(null)
      setShowAIPanel(false)
    },
    [editor],
  )

  // 点击 AI 按钮时，保存选区并激活高亮
  const handleAIButtonClick = useCallback(() => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, ' ')
    
    // 保存选区
    setSavedSelection({
      bookmark: editor.state.selection.getBookmark(),
      text,
    })
    
    // 激活高亮装饰（紫色自定义样式）
    editor.commands.setAISelectionHighlight(from, to)

    // 我们不再使用 removeAllRanges() 来清除选区，因为这会破坏作为 source of truth 的选区状态
    // 相反，我们通过在 editor.view.dom 上添加 class 并配合 CSS ::selection transparent 来视觉上隐藏它
    
    // 显示独立的 AI 面板
    setShowAIPanel(true)
  }, [editor])

  // 关闭 AI 面板时，清除高亮
  const handleCloseAIPanel = useCallback((payload: AIPanelClosePayload) => {
    if (payload.reason === 'replace' && typeof payload.caretPos === 'number') {
      clearAIPanelState(payload.caretPos)
      return
    }

    if (payload.reason === 'cancel') {
      const resolvedSelection = resolveSavedSelection(editor, savedSelection)
      clearAIPanelState(resolvedSelection?.to)
      return
    }
    
    clearAIPanelState()
  }, [clearAIPanelState, editor, savedSelection])

  return (
    <>
      {/* 原始工具栏 - AI 面板显示时不渲染 */}
      {!showAIPanel && (
        <TiptapBubbleMenu
          editor={editor}
          className="bubble-menu"
          shouldShow={({ state }) => {
            return !isNodeSelection(state.selection) && !state.selection.empty
          }}
        >
          {/* AI Button */}
          <AIButton onClick={handleAIButtonClick} />

          <Divider />

          {/* Node Type Select */}
          <NodeTypeSelect
            editor={editor}
            activeTypeId={ui.nodeTypeId}
            placementDir={placementDir}
            onRequestPlacement={requestDropdownPlacement}
          />

          {/* Alignment Select */}
          <AlignSelect
            editor={editor}
            activeAlignId={ui.alignId}
            placementDir={placementDir}
            onRequestPlacement={requestDropdownPlacement}
          />

          <Divider />

          {/* Format Buttons */}
          <FormatButtons
            editor={editor}
            isBold={ui.isBold}
            isCode={ui.isCode}
            isItalic={ui.isItalic}
            isStrike={ui.isStrike}
            isUnderline={ui.isUnderline}
          />

          <Divider />

          {/* Color Select */}
          <ColorSelect
            editor={editor}
            activeTextColor={ui.textColor}
            activeHighlight={ui.highlightColor}
            placementDir={placementDir}
            onRequestPlacement={requestDropdownPlacement}
          />

          <Divider />

          {/* More Menu */}
          <MoreMenu
            editor={editor}
            placementDir={placementDir}
            onRequestPlacement={requestDropdownPlacement}
          />
        </TiptapBubbleMenu>
      )}

      {/* 独立的 AI 浮动面板 */}
      {showAIPanel && savedSelection && (
        <AIFloatingPanel
          editor={editor}
          savedSelection={savedSelection}
          onClose={handleCloseAIPanel}
        />
      )}
    </>
  )
}
