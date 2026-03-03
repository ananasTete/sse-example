import { ChatConversation } from "@/features/chat/components/conversation/chat-conversation";
import { useChatSessionOrchestrator } from "../hooks/use-chat-session-orchestrator";

export function ChatNewConversationPage() {
  const {
    status,
    error,
    createAndStartConversation,
  } = useChatSessionOrchestrator();

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ChatConversation
        key="new-chat"
        isCreatingChat={status === "creating" || status === "hydrating"}
        creationError={error}
        onCreateChat={createAndStartConversation}
      />
    </div>
  );
}
