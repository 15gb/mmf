import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Settings, Trash2, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { toast } from "sonner";

const ChatPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { messages, addMessage, clearMessages, updateLastAssistant } = useMessages();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const charName = settings.charName || "AI 캐릭터";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = addMessage({ role: "user", content: trimmed });
    setInput("");
    setIsLoading(true);

    // Prepare history (exclude greeting if it's the only assistant msg)
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
        <div className="flex gap-2">
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
        {settings.chatBackground && (
          <div className="absolute inset-0 bg-background/60 pointer-events-none" />
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
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
          <div className="flex justify-start">
            <div className="bg-chat-theirs text-chat-theirs-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
              <Loader2 size={16} className="animate-spin" />
            </div>
          </div>
        )}
      </div>

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
