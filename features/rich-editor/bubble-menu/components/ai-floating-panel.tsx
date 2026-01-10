'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { type Editor } from '@tiptap/react'
import { Loader2, ArrowRight, Replace } from 'lucide-react'
import { 
  useFloating, 
  offset, 
  flip, 
  shift, 
  autoUpdate,
  FloatingPortal 
} from '@floating-ui/react'
import { useGeneration } from '@/features/ai-sdk/hooks/useGeneration'

interface SavedSelection {
  from: number
  to: number
  text: string
}

type AIMode = 'input' | 'result'

interface AIFloatingPanelProps {
  editor: Editor
  savedSelection: SavedSelection
  onClose: () => void
}



/**
 * 独立的 AI 浮动面板组件
 * 使用 Floating UI 定位到选区位置，独立于 BubbleMenu
 */
export function AIFloatingPanel({ 
  editor, 
  savedSelection, 
  onClose 
}: AIFloatingPanelProps) {
  const [mode, setMode] = useState<AIMode>('input')
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 创建虚拟参考元素，基于选区位置
  const virtualReference = useMemo(() => {
    return {
      getBoundingClientRect: () => {
        // 获取选区的坐标
        const fromCoords = editor.view.coordsAtPos(savedSelection.from)
        const toCoords = editor.view.coordsAtPos(savedSelection.to)
        
        // 计算选区的边界框
        const top = Math.min(fromCoords.top, toCoords.top)
        const bottom = Math.max(fromCoords.bottom, toCoords.bottom)
        const left = Math.min(fromCoords.left, toCoords.left)
        const right = Math.max(fromCoords.right, toCoords.right)
        
        return {
          top,
          bottom,
          left,
          right,
          width: right - left,
          height: bottom - top,
          x: left,
          y: top,
        }
      },
    }
  }, [editor, savedSelection])

  // Floating UI 配置
  const { refs, floatingStyles, elements } = useFloating({
    placement: 'bottom-start',
    middleware: [
      offset(8), // 与选区保持 8px 距离
      flip({
        fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
        padding: 16,
      }),
      shift({ padding: 16 }), // 防止超出视口
    ],
    whileElementsMounted: autoUpdate,
  })

  // 判断是否已定位完成，用于处理首次渲染闪烁
  const isPositioned = !!elements.floating && floatingStyles.transform

  // 计算安全的浮动样式
  const safeFloatingStyles = useMemo(() => ({
    ...floatingStyles,
    visibility: isPositioned ? 'visible' : 'hidden',
  } as React.CSSProperties), [floatingStyles, isPositioned])

  // 将虚拟参考元素设置为 reference
  useEffect(() => {
    refs.setReference(virtualReference)
  }, [refs, virtualReference])

  const { generate, isLoading, value: streamingResult } = useGeneration({
    api: '/api/chat',
    onStartStream: () => {
      // 收到第一个 chunk 时，切换到 result 模式
      setMode('result')
    },
    onError: (error) => {
      console.error('AI generation error:', error)
    }
  })

  // 自动聚焦输入框
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // 处理确定按钮点击
  const handleSubmit = useCallback(() => {
    if (isLoading) return
    
    generate({
      prompt: inputValue,
      text: savedSelection.text,
    })
  }, [isLoading, generate, inputValue, savedSelection.text])

  // 处理替换按钮点击
  const handleReplace = useCallback(() => {
    if (!streamingResult) return
    
    const { from, to } = savedSelection
    editor.chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, streamingResult)
      .run()
    
    onClose()
  }, [streamingResult, savedSelection, editor, onClose])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [handleSubmit, onClose])

  return (
    <FloatingPortal>
      <div 
        ref={(node) => refs.setFloating(node)}
        style={safeFloatingStyles}
        className="ai-floating-panel"
        onKeyDown={handleKeyDown}
      >
        {/* Textarea 输入框 */}
        <textarea
          ref={textareaRef}
          className="ai-panel-textarea"
          placeholder="请输入你希望 AI 帮你做的事情..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          rows={2}
        />

        {/* 结果展示框 - 在 result 模式下显示流式内容 */}
        {mode === 'result' && (
          <div className="ai-panel-result">
            {streamingResult || (isLoading ? '正在生成...' : '')}
          </div>
        )}

        {/* 按钮组 */}
        <div className="ai-panel-actions">
          <button
            type="button"
            className="ai-panel-btn ai-panel-btn-cancel"
            onClick={onClose}
          >
            取消
          </button>

          {/* 替换按钮 - 只在 result 模式下显示 */}
          {mode === 'result' && (
            <button
              type="button"
              className="ai-panel-btn ai-panel-btn-replace"
              onClick={handleReplace}
            >
              <Replace size={14} />
              替换
            </button>
          )}

          <button
            type="button"
            className="ai-panel-btn ai-panel-btn-submit"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 size={14} className="ai-panel-loading" />
            ) : (
              <ArrowRight size={14} />
            )}
          </button>
        </div>
      </div>
    </FloatingPortal>
  )
}
