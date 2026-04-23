import { memo } from 'react'
import { Sparkles } from 'lucide-react'

interface AIButtonProps {
  onClick?: () => void
}

export const AIButton = memo(function AIButton({ onClick }: AIButtonProps) {
  return (
    <button
      type="button"
      className="ai-button"
      onClick={onClick}
      title="Ask AI"
    >
      <Sparkles size={14} />
      <span>Ask AI</span>
    </button>
  )
})
