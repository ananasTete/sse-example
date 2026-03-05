import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MessageSquarePlus, MessagesSquare, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/advanced-chat")({
  component: AdvancedChatLayout,
});

interface ChatHistoryItem {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
}

interface AdvancedChatHistoryContextValue {
  refresh: () => void;
}

const AdvancedChatHistoryContext =
  createContext<AdvancedChatHistoryContextValue | null>(null);
const FALLBACK_HISTORY_CONTEXT: AdvancedChatHistoryContextValue = {
  refresh: () => {},
};

export function useAdvancedChatHistory() {
  return useContext(AdvancedChatHistoryContext) ?? FALLBACK_HISTORY_CONTEXT;
}

function useAdvancedChatHistoryState() {
  const [chats, setChats] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch("/api/advanced-chat")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        return (await response.json()) as ChatHistoryItem[];
      })
      .then((data) => setChats(data))
      .catch((fetchError) => {
        console.error("Failed to fetch advanced chat history:", fetchError);
        setError("历史记录加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { chats, loading, error, refresh };
}

const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const time = new Date(dateStr).getTime();
  const diff = time - now;
  const mins = Math.round(diff / 60_000);

  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, "day");

  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function ChatSidebar({
  activeChatId,
  chats,
  loading,
  error,
}: {
  activeChatId?: string;
  chats: ChatHistoryItem[];
  loading: boolean;
  error: string | null;
}) {
  const navigate = useNavigate();

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/70 bg-sidebar/95 backdrop-blur-sm"
    >
      <SidebarHeader className="flex-col items-stretch gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              Advanced Chat
            </p>
            <p className="truncate text-xs text-sidebar-foreground/55">
              多分支流式对话
            </p>
          </div>
        </div>

        <Button
          onClick={() => navigate({ to: "/advanced-chat" })}
          size="sm"
          className="h-9 justify-start gap-2 rounded-lg bg-foreground text-background hover:bg-foreground/90"
        >
          <MessageSquarePlus className="h-4 w-4" />
          新建对话
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-3">
        <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/45">
          会话列表
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="space-y-1.5 px-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="rounded-lg px-3 py-2.5">
                  <Skeleton className="h-3.5 w-4/5 rounded" />
                  <Skeleton className="mt-2 h-2.5 w-1/3 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-3 py-8 text-center text-xs text-sidebar-foreground/60">
              {error}
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-sidebar-foreground/45">
              <MessagesSquare className="h-6 w-6" />
              <p className="text-xs">还没有历史对话</p>
            </div>
          ) : (
            <div className="space-y-1 px-2 pb-4">
              {chats.map((chat) => (
                <Link
                  key={chat.id}
                  to="/advanced-chat/$chatId"
                  params={{ chatId: chat.id }}
                  className={cn(
                    "group flex flex-col gap-1 rounded-lg px-3 py-2.5 transition-colors",
                    activeChatId === chat.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span className="truncate text-sm font-medium leading-tight">
                    {chat.title || "新对话"}
                  </span>
                  <span className="text-[10px] text-sidebar-foreground/45">
                    {formatRelativeTime(chat.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4 pt-2">
        <p className="text-[10px] text-sidebar-foreground/35">DeepSeek R1</p>
      </SidebarFooter>
    </Sidebar>
  );
}

function AdvancedChatLayout() {
  const { chats, loading, error, refresh } = useAdvancedChatHistoryState();

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const activeChatId = useMemo(() => {
    const matcher = pathname.match(/^\/advanced-chat\/([^/]+)$/);
    return matcher?.[1];
  }, [pathname]);

  return (
    <AdvancedChatHistoryContext.Provider value={{ refresh }}>
      <SidebarProvider defaultOpen={true}>
        <div className="flex h-svh w-full overflow-hidden bg-background">
          <ChatSidebar
            activeChatId={activeChatId}
            chats={chats}
            loading={loading}
            error={error}
          />

          <SidebarInset className="min-h-0 flex-1">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background/90 px-3 sm:px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="text-muted-foreground" />
                <div className="hidden sm:block">
                  <p className="text-sm font-medium tracking-tight">Advanced Chat</p>
                </div>
              </div>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                DeepSeek R1
              </span>
            </header>

            <div className="flex min-h-0 flex-1">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AdvancedChatHistoryContext.Provider>
  );
}
