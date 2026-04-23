'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { type Editor, useEditorState } from '@tiptap/react'
import { Loader2, ArrowRight, Replace } from 'lucide-react'
import { 
  useFloating, 
  offset, 
  flip, 
  shift, 
  autoUpdate,
  FloatingPortal 
} from '@floating-ui/react'
import { useGeneration } from '@/features/ai-sdk/hooks/use-generation/useGeneration'
import {
  resolveSavedSelection,
  type SavedSelection,
} from '../selection'

type AIStatus = 'input' | 'loading' | 'result' | 'error' | 'empty'

interface AIFloatingPanelProps {
  editor: Editor
  savedSelection: SavedSelection
  onClose: (payload: AIPanelClosePayload) => void
}

export interface AIPanelClosePayload {
  reason: 'cancel' | 'replace' | 'selection-lost'
  caretPos?: number
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
  const [status, setStatus] = useState<AIStatus>('input')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectionRange = useEditorState({
    editor,
    selector: ({ editor }) => {
      const resolvedSelection = resolveSavedSelection(editor, savedSelection)

      if (!resolvedSelection) return null

      return {
        from: resolvedSelection.from,
        to: resolvedSelection.to,
      }
    },
  })

  // 创建虚拟参考元素，基于选区位置
  const virtualReference = useMemo(() => {
    return {
      getBoundingClientRect: () => {
        if (!selectionRange) {
          return {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
          }
        }

        // 获取选区的坐标
        const fromCoords = editor.view.coordsAtPos(selectionRange.from)
        const toCoords = editor.view.coordsAtPos(selectionRange.to)
        
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
  }, [editor, selectionRange])

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
  const isPositioned =
    !!selectionRange &&
    !!elements.floating &&
    floatingStyles.transform

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
      setStatus('result')
    },
    onFinish: (fullText) => {
      if (fullText.trim()) {
        setStatus('result')
        return
      }

      setStatus('empty')
    },
    onError: (error) => {
      console.error('AI generation error:', error)
      const message =
        error instanceof Error ? error.message : '生成失败，请重试。'
      setErrorMessage(message || '生成失败，请重试。')
      setStatus('error')
    },
  })

  // 自动聚焦输入框
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  useEffect(() => {
    if (!selectionRange) {
      onClose({ reason: 'selection-lost' })
    }
  }, [selectionRange, onClose])

  // 处理确定按钮点击
  const handleSubmit = useCallback(() => {
    if (isLoading || !selectionRange) return

    setErrorMessage(null)
    setStatus('loading')
    
    generate({
      prompt: inputValue,
      text: savedSelection.text,
    })
  }, [isLoading, selectionRange, generate, inputValue, savedSelection.text])

  // 处理替换按钮点击
  const handleReplace = useCallback(() => {
    if (!streamingResult || !selectionRange) return
    
    const { from, to } = selectionRange
    const caretPos = from + streamingResult.length

    editor.chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, streamingResult)
      .setTextSelection(caretPos)
      .run()
    
    onClose({ reason: 'replace', caretPos })
  }, [streamingResult, selectionRange, editor, onClose])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose({ reason: 'cancel' })
    }
  }, [handleSubmit, onClose])

  const resultClassName = [
    'ai-panel-result',
    status === 'error' ? 'is-error' : '',
    status === 'empty' ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const resultContent =
    status === 'loading'
      ? '正在生成...'
      : status === 'result'
        ? streamingResult
        : status === 'error'
          ? errorMessage || '生成失败，请重试。'
          : status === 'empty'
            ? '未生成可替换文本，请调整指令后重试。'
            : ''

  return (
    <FloatingPortal>
      <div
        className="ai-floating-backdrop"
        style={{ visibility: isPositioned ? 'visible' : 'hidden' }}
        onPointerDown={() => onClose({ reason: 'cancel' })}
      />
      <div
        ref={(node) => refs.setFloating(node)}
        style={safeFloatingStyles}
        className="ai-floating-panel"
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
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

        {status !== 'input' && (
          <div className={resultClassName}>
            {resultContent}
          </div>
        )}

        {/* 按钮组 */}
        <div className="ai-panel-actions">
          <button
            type="button"
            className="ai-panel-btn ai-panel-btn-cancel"
            onClick={() => onClose({ reason: 'cancel' })}
          >
            取消
          </button>

          {status === 'result' && Boolean(streamingResult) && (
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
            disabled={isLoading || !selectionRange}
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
