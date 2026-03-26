import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { toast } from "sonner";

const SPLIT_MARKER = "[[SPLIT]]";

const ChatPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSettings();
  const { messages, addMessage, clearMessages, deleteMessage, deleteMessagesFrom, updateLastAssistant, loadMessages } = useMessages();
  const { conversations, saveConversation } = useConversations();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const charName = settings.charName || "AI 캐릭터";

  // Handle URL params for loading/new conversations
  useEffect(() => {
    const loadId = searchParams.get("load");
    const isNew = searchParams.get("new");

    if (isNew) {
      clearMessages();
      setCurrentConvId(null);
      setSearchParams({}, { replace: true });
      return;
    }

    if (loadId) {
      const conv = conversations.find((c) => c.id === loadId);
      if (conv) {
        loadMessages(conv.messages);
        setCurrentConvId(conv.id);
      }
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [contextMenu]);

  const handleSave = useCallback(() => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }
    const id = saveConversation(messages, currentConvId || undefined);
    if (id) {
      setCurrentConvId(id);
      toast.success(currentConvId ? "대화가 업데이트되었습니다" : "대화가 저장되었습니다");
    }
  }, [messages, currentConvId, saveConversation]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = addMessage({ role: "user", content: trimmed });
    setInput("");
    setIsLoading(true);

    const history = [...messages, { role: "user" as const, content: trimmed, id: userMsg.id, timestamp: userMsg.timestamp }]
      .map((m) => ({ role: m.role, content: m.content }));

    let assistantStarted = false;
    let fullContent = "";

    await streamChat({
      messages: history,
      settings,
      onDelta: (text) => {
        fullContent += text;
        if (!assistantStarted) {
          assistantStarted = true;
          addMessage({ role: "assistant", content: fullContent });
        } else {
          updateLastAssistant(fullContent);
        }
      },
      onDone: () => {
        setIsLoading(false);
        if (fullContent.includes(SPLIT_MARKER)) {
          const parts = fullContent.split(SPLIT_MARKER).map(p => p.trim()).filter(Boolean);
          if (parts.length > 1) {
            updateLastAssistant(parts[0]);
            for (let i = 1; i < parts.length; i++) {
              addMessage({ role: "assistant", content: parts[i] });
            }
          }
        }
      },
      onError: (error) => {
        setIsLoading(false);
        toast.error(error);
        if (!assistantStarted) {
          addMessage({ role: "assistant", content: `⚠️ ${error}` });
        }
      },
    });
  }, [input, isLoading, messages, settings, addMessage, updateLastAssistant]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleLongPress = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setContextMenu({ id, x: clientX, y: clientY });
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity"
        >
          {settings.charAvatar ? (
            <img src={settings.charAvatar} alt={charName} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
              {charName[0]}
            </div>
          )}
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">{charName}</p>
            <p className="text-xs text-muted-foreground">설정하려면 탭하세요</p>
          </div>
        </button>
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors"
            title="대화 저장"
          >
            <Save size={18} />
          </button>
          <button
            onClick={() => navigate("/conversations")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            title="저장된 대화"
          >
            <List size={18} />
          </button>
          <button
            onClick={clearMessages}
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
            title="대화 초기화"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-3 relative"
        style={settings.chatBackground ? {
          backgroundImage: `url(${settings.chatBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} relative z-10`}
            onContextMenu={(e) => handleLongPress(msg.id, e)}
          >
            {msg.role === "assistant" && (
              settings.charAvatar ? (
                <img src={settings.charAvatar} alt={charName} className="w-7 h-7 rounded-full object-cover mr-2 mt-1 shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold mr-2 mt-1 shrink-0">
                  {charName[0]}
                </div>
              )
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-chat-mine text-chat-mine-foreground rounded-br-md whitespace-pre-wrap"
                  : "bg-chat-theirs text-chat-theirs-foreground rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>p+p]:mt-2">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start relative z-10">
            <div className="bg-chat-theirs text-chat-theirs-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
              <Loader2 size={16} className="animate-spin" />
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            onClick={() => {
              deleteMessage(contextMenu.id);
              setContextMenu(null);
              toast.success("메시지가 삭제되었습니다");
            }}
          >
            <X size={14} />
            이 메시지 삭제
          </button>
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors"
            onClick={() => {
              deleteMessagesFrom(contextMenu.id);
              setContextMenu(null);
              toast.success("이 메시지 이전까지 삭제되었습니다");
            }}
          >
            <Scissors size={14} />
            여기까지 삭제
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-card px-3 py-2 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
            style={{ minHeight: "40px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
