import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'
import { isNodeSelection } from '@tiptap/core'
import { type Editor } from '@tiptap/react'
import { useEffect, useState, useCallback, useRef } from 'react'

import { AIButton } from './components/ai-button'
import { AIFloatingPanel } from './components/ai-floating-panel'
import './bubble-menu.css'
import { Divider } from './components/divider'
import { NodeTypeSelect } from './components/node-type-select'
import { AlignSelect } from './components/align-select'
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
  
  // 使用 ref 保存最新的 showAIPanel 状态，避免在 useEffect 中频繁订阅/取消订阅
  const showAIPanelRef = useRef(showAIPanel)
  useEffect(() => {
    showAIPanelRef.current = showAIPanel
  }, [showAIPanel])

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
    editor.commands.clearAISelectionHighlight()
    setSavedSelection(null)
    setShowAIPanel(false)
  }, [editor])

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

  /**
   * Update placement direction based on selection position
   */
  useEffect(() => {
    const updatePlacement = () => {
      const { selection } = editor.state

      // Only update placement for text selections (not node selections)
      if (isNodeSelection(selection)) return

      const { from } = selection
      // Get the coordinates of the selection start
      const coords = editor.view.coordsAtPos(from)

      // If the selection is in the bottom half of the screen, open upwards
      // We use a threshold of 50% of the viewport height
      if (coords.top > window.innerHeight / 2) {
        setPlacementDir('top')
      } else {
        setPlacementDir('bottom')
      }
    }

    updatePlacement()

    editor.on('selectionUpdate', updatePlacement)
    editor.on('transaction', updatePlacement)
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true) // Capture scroll to handle all scrollable containers

    return () => {
      editor.off('selectionUpdate', updatePlacement)
      editor.off('transaction', updatePlacement)
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [editor])

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
          <NodeTypeSelect editor={editor} placementDir={placementDir} />

          {/* Alignment Select */}
          <AlignSelect editor={editor} placementDir={placementDir} />

          <Divider />

          {/* Format Buttons */}
          <FormatButtons editor={editor} />

          <Divider />

          {/* Color Select */}
          <ColorSelect editor={editor} placementDir={placementDir} />

          <Divider />

          {/* More Menu */}
          <MoreMenu editor={editor} placementDir={placementDir} />
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

