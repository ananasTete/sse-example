import { Sparkles } from 'lucide-react'

interface AIButtonProps {
  onClick?: () => void
}

export function AIButton({ onClick }: AIButtonProps) {
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
}
