import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List, Star } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
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

  // Auto-save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messages.length > 0) {
        // Save directly to localStorage to ensure it persists
        const convs = JSON.parse(localStorage.getItem("saved-conversations") || "[]");
        const firstUserMsg = messages.find((m) => m.role === "user");
        const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) : "새 대화";
        const now = Date.now();

        if (currentConvId) {
          const updated = convs.map((c: any) =>
            c.id === currentConvId ? { ...c, messages, title, settings, updatedAt: now } : c
          );
          localStorage.setItem("saved-conversations", JSON.stringify(updated));
        } else {
          const newConv = {
            id: crypto.randomUUID(),
            title,
            messages,
            settings,
            createdAt: now,
            updatedAt: now,
          };
          localStorage.setItem("saved-conversations", JSON.stringify([newConv, ...convs]));
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [messages, currentConvId, settings]);

  const handleSave = useCallback(() => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }
    // If already saved to a slot, ask to overwrite or create new
    if (currentConvId) {
      setShowOverwriteDialog(true);
      return;
    }
    const id = saveConversation(messages, undefined, settings);
    if (id) {
      setCurrentConvId(id);
      toast.success("대화가 저장되었습니다");
    }
  }, [messages, currentConvId, saveConversation, settings]);

  const handleOverwriteConfirm = useCallback((overwrite: boolean) => {
    setShowOverwriteDialog(false);
    if (overwrite) {
      saveConversation(messages, currentConvId || undefined, settings);
      toast.success("대화가 업데이트되었습니다");
    } else {
      const id = saveConversation(messages, undefined, settings);
      if (id) {
        setCurrentConvId(id);
        toast.success("새 슬롯에 저장되었습니다");
      }
    }
  }, [messages, currentConvId, saveConversation, settings]);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = overrideContent !== undefined ? overrideContent : input.trim();
    // Allow empty string (for auto-continue)
    if (content === undefined || isLoading) return;

    const isEmptyMessage = content === "";
    
    if (!isEmptyMessage) {
      const userMsg = addMessage({ role: "user", content });
    }
    setInput("");
    setIsLoading(true);

    const history = [
      ...messages,
      ...(!isEmptyMessage ? [{ role: "user" as const, content }] : []),
    ].map((m) => ({ role: m.role, content: m.content }));

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

  const handleNarration = useCallback(() => {
    if (isLoading) return;
    const trimmed = input.trim();
    const narrationText = trimmed ? `*${trimmed}*` : "";
    if (narrationText) {
      handleSend(narrationText);
    } else {
      // Empty narration = just add asterisks to input
      setInput("**");
    }
  }, [input, isLoading, handleSend]);

  const handleLongPress = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setContextMenu({ id, x: clientX, y: clientY });
  };

  // Render message content - narration (*text*) gets special styling
  const renderContent = (msg: { role: string; content: string }) => {
    if (msg.role === "assistant") {
      return (
        <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>p+p]:mt-2">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }
    // For user messages, check if it's narration (wrapped in *)
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*") && msg.content.length > 2;
    if (isNarration) {
      return <span className="italic text-muted-foreground">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
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
          <button onClick={handleSave} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors" title="대화 저장">
            <Save size={18} />
          </button>
          <button onClick={() => navigate("/conversations")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="저장된 대화">
            <List size={18} />
          </button>
          <button onClick={clearMessages} className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="대화 초기화">
            <Trash2 size={18} />
          </button>
          <button onClick={() => navigate("/settings")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
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
              {renderContent(msg)}
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
            onClick={handleNarration}
            disabled={isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center disabled:opacity-40 transition-opacity active:scale-95"
            title="나레이션 (별표로 감싸서 전송)"
          >
            <Star size={18} />
          </button>
          <button
            onClick={() => handleSend(input.trim() === "" ? "" : undefined)}
            disabled={isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Overwrite dialog */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>대화 저장</DialogTitle>
            <DialogDescription>
              이미 저장된 대화입니다. 기존 슬롯을 덮어쓰시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => handleOverwriteConfirm(false)}>
              새로 저장
            </Button>
            <Button className="flex-1" onClick={() => handleOverwriteConfirm(true)}>
              덮어쓰기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPage;
