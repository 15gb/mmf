import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List, Star, ImageIcon, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import { generateImage, encodeImageMessage, decodeImageMessage } from "@/lib/image-api";
import ImageCard from "@/components/ImageCard";
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
  const { conversations, saveConversation, autoSaveConversation, deleteConversation } = useConversations();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 최신 상태 참조용 (자동저장용)
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);

  useEffect(() => {
    messagesRef.current = messages;
    settingsRef.current = settings;
  }, [messages, settings]);

  const charName = settings.charName || "AI 캐릭터";

  // URL 파라미터 처리
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
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, []);

  /** ⭐ [추가] 페이지 이탈 시 자동 저장 (1~5번 로테이션) */
  useEffect(() => {
    const handleExitSave = () => {
      if (messagesRef.current.length > 0) {
        autoSaveConversation(messagesRef.current, settingsRef.current);
      }
    };
    window.addEventListener("beforeunload", handleExitSave);
    return () => {
      window.removeEventListener("beforeunload", handleExitSave);
      handleExitSave();
    };
  }, [autoSaveConversation]);

  const getDefaultSaveTitle = useCallback(() => {
    const name = (settings.charName || "").trim();
    return (name || "새 대화").slice(0, 30);
  }, [settings.charName]);

  const handleSave = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }
    const currentTitle = getDefaultSaveTitle();
    const id = await saveConversation(messages, { title: currentTitle, settings });
    if (id) {
      setCurrentConvId(id);
      toast.success("대화가 저장되었습니다");
    }
  }, [messages, saveConversation, settings, getDefaultSaveTitle]);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = overrideContent !== undefined ? overrideContent : input.trim();
    if ((content === "" && overrideContent === undefined) || isLoading) return;

    const isSystemMessage = content.startsWith("[SYSTEM]");
    const isEmptyMessage = content === "";
    
    if (!isSystemMessage && !isEmptyMessage) {
      addMessage({ role: "user", content });
    }
    setInput("");
    setIsLoading(true);

    const systemParts: string[] = [];
    systemParts.push(`당신은 "${settings.charName}"를 연기하는 숙련된 역할극 작가입니다.`);
    
    if (settings?.charPersona) systemParts.push(`[성격 및 말투]\n${settings.charPersona}`);
    if (settings?.worldSetting) systemParts.push(`[세계관 설정]\n${settings.worldSetting}`);
    if (settings?.myName) systemParts.push(`상대방(유저) 이름: ${settings.myName}`);
    if (settings?.note) systemParts.push(`[기억해야 할 내용]\n${settings.note}`);

    // ⭐ [응답 규칙 강화]
    systemParts.push(`
[응답 규칙]
1. 행동, 표정, 주변 환경 묘사(나레이션)는 반드시 별표(*)로 감싸주세요. (예: *가볍게 웃으며 손을 흔든다*)
2. 대화문은 반드시 따옴표("")를 사용해주세요.
3. 응답은 상황을 풍부하게 묘사하여 **최소 5줄 이상**으로 길게 작성하세요.
4. 한 번의 응답에 대사뿐만 아니라 풍부한 나레이션을 포함해 하나의 완성된 '장면'을 만들어주세요.
5. 장면이 너무 길거나 분위기가 완전히 바뀔 때만 "${SPLIT_MARKER}" 구분자를 사용해 메시지를 나누어주세요. 기본적으로는 한 블록에 모두 담습니다.`);

    const systemPrompt = systemParts.join("\n\n");
    const history = messages.slice(-10).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[최근 대화 기록]\n${history}\n\nUser: ${content}\n\nAI:`;

    let fullContent = "";
    let assistantStarted = false;

    try {
      await streamChat({
        message: combinedPrompt,
        onDelta: (delta) => {
          fullContent += delta;
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
        }
      });
    } catch (error: any) {
      setIsLoading(false);
      toast.error(error.message);
    }
  }, [input, isLoading, messages, settings, addMessage, updateLastAssistant]);

  // 나레이션 버튼 핸들러
  const handleNarration = useCallback(() => {
    if (isLoading) return;
    const trimmed = input.trim();
    if (trimmed) {
      handleSend(`*${trimmed}*`);
    } else {
      setInput("*");
    }
  }, [input, isLoading, handleSend]);

  const handleSummonCharacter = useCallback(() => {
    if (isLoading) return;
    const supportingChars = settings.supportingCharacters || [];
    const charList = supportingChars.map(c => `- ${c.name}: ${c.persona}`).join("\n");
    const summonPrompt = `[SYSTEM] 현재 상황에 조연 캐릭터를 등장시켜 이야기를 이어가주세요. ${charList ? `\n\n[조연 후보]:\n${charList}` : ""}`;
    handleSend(summonPrompt);
  }, [isLoading, handleSend, settings.supportingCharacters]);

  const handleGenerateImage = useCallback(async () => {
    if (isLoading || isGeneratingImage) return;
    setIsGeneratingImage(true);
    const toastId = toast.loading("장면 분석 중...");
    try {
      const { imageUrl, prompt } = await generateImage(messages, settings, (status) => toast.loading(status, { id: toastId }));
      addMessage({ role: "assistant", content: encodeImageMessage(imageUrl, prompt) });
      toast.success("이미지가 생성되었습니다!", { id: toastId });
    } catch (e: any) {
      toast.error(e.message, { id: toastId });
    } finally {
      setIsGeneratingImage(false);
    }
  }, [isLoading, isGeneratingImage, messages, settings, addMessage]);

  const renderContent = (msg: { role: string; content: string }) => {
    const imgData = decodeImageMessage(msg.content);
    if (imgData) return <ImageCard url={imgData.url} prompt={imgData.prompt} />;

    if (msg.role === "assistant") {
      return (
        <div className="prose prose-sm prose-invert max-w-none 
          [&_em]:not-italic [&_em]:text-muted-foreground/70 [&_em]:font-normal
          [&_p]:m-0 [&_p+p]:mt-2">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }
    
    if (msg.content.startsWith("*") && msg.content.endsWith("*")) {
      return <span className="italic text-muted-foreground/80">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {settings.charAvatar ? <img src={settings.charAvatar} className="w-full h-full rounded-full object-cover" /> : charName[0]}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">{charName}</p>
            <p className="text-xs text-muted-foreground">설정하려면 탭하세요</p>
          </div>
        </button>
        <div className="flex gap-1 text-muted-foreground">
          <button onClick={handleGenerateImage} className="p-2 hover:text-primary">{isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}</button>
          <button onClick={handleSave} className="p-2 hover:text-primary"><Save size={18} /></button>
          <button onClick={() => navigate("/conversations")} className="p-2 hover:text-foreground"><List size={18} /></button>
          <button onClick={clearMessages} className="p-2 hover:text-destructive"><Trash2 size={18} /></button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4" style={settings.chatBackground ? { backgroundImage: `url(${settings.chatBackground})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-none" : "bg-card border border-border rounded-bl-none text-foreground"}`}>
              {renderContent(msg)}
            </div>
          </div>
        ))}
        {isLoading && <Loader2 className="animate-spin text-muted-foreground" size={20} />}
      </div>

      <div className="shrink-0 border-t border-border bg-card px-3 py-3 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 max-h-32"
          />
          <button onClick={handleNarration} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all active:scale-90"><Star size={18} /></button>
          <button onClick={handleSummonCharacter} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-all active:scale-90"><Users size={18} /></button>
          <button onClick={() => handleSend()} disabled={isLoading || (!input.trim())} className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;