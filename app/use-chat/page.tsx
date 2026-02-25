"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useQueryClient } from "@tanstack/react-query";
import { Message } from "@/features/ai-sdk/hooks/use-chat/types";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UseChatSidebar } from "./components/use-chat-sidebar";
import { UseChatConversation } from "./components/conversation/use-chat-conversation";
import { chatHistoryKeys } from "./services/chat-history";

interface ChatBootstrapResponse {
  chat: {
    id: string;
  };
  messages?: Message[];
}

export default function UseChatPage() {
  const queryClient = useQueryClient();
  const chatSelectRequestId = useRef(0);
  const [chatId, setChatId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [isChatPersisted, setIsChatPersisted] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSwitchingChat, setIsSwitchingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const queryChatId = searchParams.get("chatId");

        if (queryChatId) {
          const response = await fetch(`/api/chats/${queryChatId}`);
          if (response.ok) {
            const data = (await response.json()) as ChatBootstrapResponse;
            setChatId(queryChatId);
            setInitialMessages(data.messages ?? []);
            setIsChatPersisted(true);
            return;
          }

          const fallbackUrl = new URL(window.location.href);
          fallbackUrl.searchParams.delete("chatId");
          window.history.replaceState({}, "", fallbackUrl.toString());
        }

        const draftChatId = nanoid();
        setChatId(draftChatId);
        setInitialMessages([]);
        setIsChatPersisted(false);
      } catch (initError) {
        setError(initError instanceof Error ? initError.message : "Unknown error");
      } finally {
        setIsBootstrapping(false);
      }
    };

    initializeChat();
  }, []);

  const handleConversationStart = () => {
    if (!chatId || isChatPersisted) return;

    const url = new URL(window.location.href);
    url.searchParams.set("chatId", chatId);
    window.history.replaceState({}, "", url.toString());
    setIsChatPersisted(true);
    void queryClient.invalidateQueries({ queryKey: chatHistoryKeys.all });
  };

  const handleCreateNewChat = () => {
    chatSelectRequestId.current += 1;
    const newDraftId = nanoid();
    setChatId(newDraftId);
    setInitialMessages([]);
    setIsChatPersisted(false);
    setError(null);
    setIsSwitchingChat(false);

    const url = new URL(window.location.href);
    url.searchParams.delete("chatId");
    window.history.replaceState({}, "", url.toString());
  };

  const handleSelectChat = async (selectedChatId: string) => {
    if (!selectedChatId) return;
    if (selectedChatId === chatId && isChatPersisted) return;

    const requestId = ++chatSelectRequestId.current;
    setIsSwitchingChat(true);
    setError(null);

    try {
      const response = await fetch(`/api/chats/${selectedChatId}`);
      if (!response.ok) {
        throw new Error("Failed to load chat");
      }

      const data = (await response.json()) as ChatBootstrapResponse;
      if (requestId !== chatSelectRequestId.current) return;
      setChatId(selectedChatId);
      setInitialMessages(data.messages ?? []);
      setIsChatPersisted(true);

      const url = new URL(window.location.href);
      url.searchParams.set("chatId", selectedChatId);
      window.history.replaceState({}, "", url.toString());
    } catch (selectError) {
      if (requestId !== chatSelectRequestId.current) return;
      setError(selectError instanceof Error ? selectError.message : "Unknown error");
    } finally {
      if (requestId === chatSelectRequestId.current) {
        setIsSwitchingChat(false);
      }
    }
  };

  if (isBootstrapping) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-stone-500">
        Loading chat...
      </div>
    );
  }

  if (!chatId) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-red-600">
        {error ?? "Chat initialization failed"}
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <UseChatSidebar
        activeChatId={isChatPersisted ? chatId : null}
        onSelectChat={handleSelectChat}
        onCreateNewChat={handleCreateNewChat}
      />
      <SidebarInset className="h-svh">
        {error ? (
          <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {error}
          </div>
        ) : null}
        {isSwitchingChat ? (
          <div className="h-full flex items-center justify-center text-sm text-stone-500">
            Loading selected chat...
          </div>
        ) : (
          <UseChatConversation
            key={chatId}
            chatId={chatId}
            initialMessages={initialMessages}
            onConversationStart={handleConversationStart}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
