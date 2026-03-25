import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Settings, Trash2 } from "lucide-react";
import { useSettings, useMessages } from "@/lib/store";

const ChatPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { messages, addMessage, clearMessages } = useMessages();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const charName = settings.charName || "AI 캐릭터";

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Show greeting if no messages
  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    addMessage({ role: "user", content: trimmed });
    setInput("");

    // Simulate AI response (placeholder until API integration)
    setTimeout(() => {
      addMessage({
        role: "assistant",
        content: "아직 AI가 연결되지 않았어요. Lovable Cloud를 활성화하면 실제 AI 응답을 받을 수 있어요! 💬",
      });
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity"
        >
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {charName[0]}
          </div>
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-chat-mine text-chat-mine-foreground rounded-br-md"
                  : "bg-chat-theirs text-chat-theirs-foreground rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-card px-3 py-2 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
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
            disabled={!input.trim()}
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
