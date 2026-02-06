import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'
import { isNodeSelection } from '@tiptap/core'
import { type Editor, useEditorState } from '@tiptap/react'
import { useEffect, useState, useCallback, useRef } from 'react'

import { AIButton } from './components/ai-button'
import { AIFloatingPanel } from './components/ai-floating-panel'
import './bubble-menu.css'
import { Divider } from './components/divider'
import { NodeTypeSelect, type NodeTypeId } from './components/node-type-select'
import { AlignSelect, type AlignId } from './components/align-select'
import { ColorSelect } from './components/color-select'
import { MoreMenu } from './components/more-menu'
import { FormatButtons } from './components/format-buttons'

interface SavedSelection {
  from: number
  to: number
  text: string
}

interface BubbleMenuProps {
  editor: Editor
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

      let nodeTypeId: NodeTypeId = 'paragraph'
      if (editor.isActive('heading', { level: 1 })) nodeTypeId = 'heading1'
      else if (editor.isActive('heading', { level: 2 })) nodeTypeId = 'heading2'
      else if (editor.isActive('heading', { level: 3 })) nodeTypeId = 'heading3'
      else if (editor.isActive('heading', { level: 4 })) nodeTypeId = 'heading4'
      else if (editor.isActive('heading', { level: 5 })) nodeTypeId = 'heading5'
      else if (editor.isActive('heading', { level: 6 })) nodeTypeId = 'heading6'
      else if (editor.isActive('bulletList')) nodeTypeId = 'bulletList'
      else if (editor.isActive('orderedList')) nodeTypeId = 'orderedList'
      else if (editor.isActive('codeBlock')) nodeTypeId = 'codeBlock'
      else if (editor.isActive('blockquote')) nodeTypeId = 'blockquote'

      let alignId: AlignId = 'left'
      if (editor.isActive({ textAlign: 'center' })) alignId = 'center'
      else if (editor.isActive({ textAlign: 'right' })) alignId = 'right'

      const textColor = editor.getAttributes('textStyle').color || null
      const highlightColor = editor.getAttributes('highlight').color || null

      return {
        selectionEmpty: selection.empty,
        isNodeSelection: isNodeSelection(selection),
        nodeTypeId,
        alignId,
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
  
  // 使用 ref 保存最新的 showAIPanel 状态，避免在 useEffect 中频繁订阅/取消订阅
  const showAIPanelRef = useRef(showAIPanel)
  useEffect(() => {
    showAIPanelRef.current = showAIPanel
  }, [showAIPanel])

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

  // 点击 AI 按钮时，保存选区并激活高亮
  const handleAIButtonClick = useCallback(() => {
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, ' ')
    
    // 保存选区
    setSavedSelection({ from, to, text })
    
    // 激活高亮装饰（紫色自定义样式）
    editor.commands.setAISelectionHighlight(from, to)

    // 我们不再使用 removeAllRanges() 来清除选区，因为这会破坏作为 source of truth 的选区状态
    // 相反，我们通过在 editor.view.dom 上添加 class 并配合 CSS ::selection transparent 来视觉上隐藏它
    
    // 显示独立的 AI 面板
    setShowAIPanel(true)
  }, [editor])

  // 关闭 AI 面板时，清除高亮
  const handleCloseAIPanel = useCallback(() => {
    // Prevent selectionUpdate listener from double-closing while we collapse selection.
    showAIPanelRef.current = false

    // Collapse selection so the bubble menu doesn't immediately re-open after dismiss.
    if (savedSelection) {
      editor.commands.setTextSelection(savedSelection.to)
    }

    editor.commands.clearAISelectionHighlight()
    setSavedSelection(null)
    setShowAIPanel(false)
  }, [editor, savedSelection])

  /**
   * Reset AI panel and clear highlight when selection becomes empty
   * 使用 ref 读取最新状态，这样只需在 editor 变化时订阅一次
   */
  useEffect(() => {
    const handleSelectionChange = () => {
      // 通过 ref 读取最新的 showAIPanel 状态
      if (editor.state.selection.empty && showAIPanelRef.current) {
        // 选区变空时，重置所有状态并清除高亮
        editor.commands.clearAISelectionHighlight()
        setSavedSelection(null)
        setShowAIPanel(false)
      }
    }

    editor.on('selectionUpdate', handleSelectionChange)
    
    return () => {
      editor.off('selectionUpdate', handleSelectionChange)
    }
  }, [editor]) // 只依赖 editor，不再依赖 showAIPanel

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
            active={{
              bold: ui.isBold,
              code: ui.isCode,
              italic: ui.isItalic,
              strike: ui.isStrike,
              underline: ui.isUnderline,
            }}
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
