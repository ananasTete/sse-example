import { useEffect, useMemo, useState } from "react";
import {
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ChatPage } from "@/features/chat/pages/chat-page";
import {
  EMPTY_CHAT_NAVIGATION_STATE,
  getBootstrapPromptFromLocationState,
} from "@/features/chat/services/chat-navigation-state";

export const Route = createFileRoute("/chat/$chatId")({
  component: ChatDetailRoute,
});

function ChatDetailRoute() {
  const navigate = useNavigate();
  const { chatId } = Route.useParams();
  const locationState = useLocation({
    select: (location) => location.state,
  });
  const parsedBootstrapPrompt = useMemo(
    () => getBootstrapPromptFromLocationState(locationState),
    [locationState],
  );
  const [capturedBootstrapPrompt, setCapturedBootstrapPrompt] = useState(() => ({
    chatId,
    prompt: parsedBootstrapPrompt,
  }));

  useEffect(() => {
    setCapturedBootstrapPrompt((current) => {
      if (current.chatId !== chatId) {
        return {
          chatId,
          prompt: parsedBootstrapPrompt,
        };
      }
      if (current.prompt) return current;
      if (!parsedBootstrapPrompt) return current;

      return { chatId, prompt: parsedBootstrapPrompt };
    });
  }, [chatId, parsedBootstrapPrompt]);

  const bootstrapPrompt =
    capturedBootstrapPrompt.chatId === chatId
      ? capturedBootstrapPrompt.prompt
      : null;

  useEffect(() => {
    if (!parsedBootstrapPrompt) return;

    void navigate({
      to: "/chat/$chatId",
      params: { chatId },
      replace: true,
      state: EMPTY_CHAT_NAVIGATION_STATE,
    });
  }, [chatId, navigate, parsedBootstrapPrompt]);

  return <ChatPage chatId={chatId} bootstrapPrompt={bootstrapPrompt} />;
}
