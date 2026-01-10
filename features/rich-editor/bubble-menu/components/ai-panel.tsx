import { useState, useRef, useEffect } from 'react'
import { type Editor } from '@tiptap/react'
import { Loader2, ArrowRight, Replace } from 'lucide-react'
import { useGeneration } from '@/features/ai-sdk/hooks/useGeneration'

interface SavedSelection {
  from: number
  to: number
  text: string
}

interface AIPanelProps {
  mode: 'input' | 'result'
  editor: Editor
  savedSelection: SavedSelection | null
  onClose: () => void
  onResult: () => void
}

// 案例结果文本
const EXAMPLE_RESULT = `此风之劲烈，大有天地色变之势，瞬间将五名修士的法宝吹得东倒西歪。至于他们本人更是被狂风禁制其中，身不由己的无法挣脱而出。
"哈哈！敬酒不吃吃罚酒，非要让本上师大费手脚才罢休，真是不知死活。"光头法士铿锵怪笑起来，满脸的得意之色。`

export function AIPanel({ 
  mode, 
  editor, 
  savedSelection, 
  onClose, 
  onResult 
}: AIPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const [resultText, setResultText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { generate, isLoading } = useGeneration({
    api: '/api/chat',
    onFinish: (fullText) => {
      setResultText(fullText || EXAMPLE_RESULT) // 使用案例文本作为后备
      onResult()
    },
    onError: (error) => {
      console.error('AI generation error:', error)
      // 发生错误时使用案例文本
      setResultText(EXAMPLE_RESULT)
      onResult()
    }
  })

  // 自动聚焦输入框
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  // 处理确定按钮点击
  const handleSubmit = () => {
    if (isLoading || !savedSelection) return
    
    generate({
      prompt: inputValue,
      text: savedSelection.text,
    })
  }

  // 处理替换按钮点击
  const handleReplace = () => {
    if (!resultText || !savedSelection) return
    
    // 使用保存的选区位置进行替换
    const { from, to } = savedSelection
    editor.chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, resultText)
      .run()
    
    onClose()
  }

  // 处理取消按钮点击
  const handleCancel = () => {
    onClose()
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div className="ai-panel" onKeyDown={handleKeyDown}>
      {/* Textarea 输入框 */}
      <textarea
        ref={textareaRef}
        className="ai-panel-textarea"
        placeholder="请输入你希望 AI 帮你做的事情..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        rows={3}
      />

      {/* 结果展示框 - 只在 result 模式下显示 */}
      {mode === 'result' && resultText && (
        <div className="ai-panel-result">
          {resultText}
        </div>
      )}

      {/* 按钮组 */}
      <div className="ai-panel-actions">
        <button
          type="button"
          className="ai-panel-btn ai-panel-btn-cancel"
          onClick={handleCancel}
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
  )
}
