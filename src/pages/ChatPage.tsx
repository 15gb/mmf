import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List, Star, ImageIcon, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { toast } from "sonner";
import { generateImage, encodeImageMessage, decodeImageMessage } from "@/lib/image-api";
import ImageCard from "@/components/ImageCard";

const SPLIT_MARKER = "[[SPLIT]]";

const ChatPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSettings();
  const { messages, addMessage, clearMessages, deleteMessage, deleteMessagesFrom, updateLastAssistant, loadMessages } = useMessages();
  const { allConversations, saveConversation, autoSaveConversation } = useConversations();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const msgRef = useRef(messages);
  const setRef = useRef(settings);
  useEffect(() => { msgRef.current = messages; setRef.current = settings; }, [messages, settings]);

  const charName = settings.charName || "AI 캐릭터";

  // URL 파라미터 로딩
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (searchParams.get("new")) {
      clearMessages(); setCurrentConvId(null);
      setSearchParams({}, { replace: true });
    } else if (loadId) {
      // allConversations에서 찾아야 숨겨진 자동저장 파일도 로드 가능
      const conv = allConversations.find((c) => c.id === loadId);
      if (conv) { 
        loadMessages(conv.messages); 
        setCurrentConvId(conv.id); 
      }
      setSearchParams({}, { replace: true });
    }
  }, [allConversations, searchParams, setSearchParams, clearMessages, loadMessages]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, [settings.charGreeting, addMessage, messages.length]);

  // 페이지 나갈 때 자동 저장
  useEffect(() => {
    const handleExit = () => { if (msgRef.current.length > 0) autoSaveConversation(msgRef.current, setRef.current); };
    window.addEventListener("beforeunload", handleExit);
    return () => { window.removeEventListener("beforeunload", handleExit); handleExit(); };
  }, [autoSaveConversation]);

  const getDefaultSaveTitle = useCallback(() => (settings.charName || "새 대화").trim().slice(0, 30), [settings.charName]);

  /** 💾 수동 저장 (캐릭터 이름 중복 체크 방식 복구) */
  const handleSave = useCallback(async () => {
    if (messages.length === 0) { toast.error("저장할 대화가 없습니다"); return; }
    const currentTitle = getDefaultSaveTitle();

    // 1. 현재 대화 중인 ID가 있으면 즉시 업데이트
    if (currentConvId) {
      await saveConversation(messages, { existingId: currentConvId, title: currentTitle, settings });
      toast.success("대화가 업데이트되었습니다");
      return;
    }

    // 2. ID는 없지만 같은 캐릭터명의 대화가 있는지 전체 목록에서 확인
    const duplicate = allConversations.find(c => c.title === currentTitle);
    
    if (duplicate) {
      if (window.confirm(`"${currentTitle}" 이름의 대화가 이미 있습니다. 덮어쓰시겠습니까?`)) {
        await saveConversation(messages, { existingId: duplicate.id, title: currentTitle, settings });
        setCurrentConvId(duplicate.id);
        toast.success("기존 대화에 덮어씌웠습니다");
      } else {
        const newTitle = window.prompt("새로운 제목을 입력하세요:", `${currentTitle} (1)`);
        if (newTitle) {
          const id = await saveConversation(messages, { title: newTitle, settings });
          if (id) setCurrentConvId(id);
          toast.success("새 대화로 저장되었습니다");
        }
      }
    } else {
      const id = await saveConversation(messages, { title: currentTitle, settings });
      if (id) { setCurrentConvId(id); toast.success("대화가 저장되었습니다"); }
    }
  }, [messages, allConversations, currentConvId, saveConversation, settings, getDefaultSaveTitle]);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = overrideContent !== undefined ? overrideContent : input.trim();
    if ((content === "" && overrideContent === undefined) || isLoading) return;
    if (!content.startsWith("[SYSTEM]") && content !== "") addMessage({ role: "user", content });
    setInput(""); setIsLoading(true);

    const systemPrompt = `너는 "${settings.charName}"를 연기하는 작가이다.\n성격: ${settings.charPersona}\n세계관: ${settings.worldSetting}\n[지침]\n1. 행동/환경 묘사는 별표(*)로 감싸라.\n2. 대사는 따옴표("")를 사용하라.\n3. 응답은 최소 5줄 이상 길게 작성하라.`;
    const history = messages.slice(-10).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[기록]\n${history}\n\nUser: ${content}\n\nAI:`;

    let fullContent = "";
    let assistantStarted = false;
    try {
      await streamChat({
        message: combinedPrompt,
        onDelta: (delta) => {
          fullContent += delta;
          if (!assistantStarted) { assistantStarted = true; addMessage({ role: "assistant", content: fullContent }); }
          else { updateLastAssistant(fullContent); }
        },
        onDone: () => {
          setIsLoading(false);
          if (fullContent.includes(SPLIT_MARKER)) {
            const parts = fullContent.split(SPLIT_MARKER).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              updateLastAssistant(parts[0]);
              for (let i = 1; i < parts.length; i++) addMessage({ role: "assistant", content: parts[i] });
            }
          }
        }
      });
    } catch (error: any) { setIsLoading(false); toast.error(error.message); }
  }, [input, isLoading, messages, settings, addMessage, updateLastAssistant]);

  const handleNarration = useCallback(() => {
    if (isLoading) return;
    const trimmed = input.trim();
    if (trimmed) handleSend(`*${trimmed}*`); else setInput("*");
  }, [input, isLoading, handleSend]);

  const handleSummonCharacter = useCallback(() => {
    if (isLoading) return;
    const charList = (settings.supportingCharacters || []).map(c => `- ${c.name}: ${c.persona}`).join("\n");
    handleSend(`[SYSTEM] 조연 등장 요청:\n${charList}`);
  }, [isLoading, handleSend, settings.supportingCharacters]);

  const handleGenerateImage = useCallback(async () => {
    if (isLoading || isGeneratingImage) return;
    setIsGeneratingImage(true);
    const toastId = toast.loading("분석 중...");
    try {
      const { imageUrl, prompt } = await generateImage(messages, settings, (status) => toast.loading(status, { id: toastId }));
      addMessage({ role: "assistant", content: encodeImageMessage(imageUrl, prompt) });
      toast.success("이미지 생성 완료!", { id: toastId });
    } catch (e: any) { toast.error(e.message, { id: toastId }); } finally { setIsGeneratingImage(false); }
  }, [isLoading, isGeneratingImage, messages, settings, addMessage]);

  const renderContent = (msg: { role: string; content: string }) => {
    const imgData = decodeImageMessage(msg.content);
    if (imgData) return <ImageCard url={imgData.url} prompt={imgData.prompt} />;
    if (msg.role === "assistant") {
      return (
        <div className="prose prose-sm prose-invert max-w-none [&_em]:not-italic [&_em]:text-muted-foreground/70 [&_p]:m-0 [&_p+p]:mt-2">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }
    if (msg.content.startsWith("*") && msg.content.endsWith("*")) return <span className="italic text-muted-foreground/80">{msg.content.slice(1, -1)}</span>;
    return msg.content;
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {settings.charAvatar ? <img src={settings.charAvatar} className="w-full h-full rounded-full object-cover" alt="avatar" /> : charName[0]}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">{charName}</p>
            <p className="text-xs text-muted-foreground">설정창</p>
          </div>
        </button>
        <div className="flex gap-1 text-muted-foreground">
          <button onClick={handleGenerateImage} className="p-2 hover:text-primary">{isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}</button>
          <button onClick={handleSave} className="p-2 hover:text-primary"><Save size={18} /></button>
          <button onClick={() => navigate("/conversations")} className="p-2 hover:text-foreground"><List size={18} /></button>
          <button onClick={clearMessages} className="p-2 hover:text-destructive"><Trash2 size={18} /></button>
          <button onClick={() => navigate("/settings")} className="p-2 hover:text-foreground"><Settings size={18} /></button>
        </div>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4" style={settings.chatBackground ? { backgroundImage: `url(${settings.chatBackground})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY }); }}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-none" : "bg-card border border-border rounded-bl-none text-foreground"}`}>
              {renderContent(msg)}
            </div>
          </div>
        ))}
      </div>
      {contextMenu && (
        <div className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => setContextMenu(null)}>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted" onClick={() => deleteMessage(contextMenu.id)}><X size={14} /> 삭제</button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted" onClick={() => deleteMessagesFrom(contextMenu.id)}><Scissors size={14} /> 여기까지 삭제</button>
        </div>
      )}
      <div className="shrink-0 border-t border-border bg-card px-3 py-3 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="메시지..." rows={1} className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 max-h-32" />
          <button onClick={handleNarration} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent active:scale-90"><Star size={18} /></button>
          <button onClick={handleSummonCharacter} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-90"><Users size={18} /></button>
          <button onClick={() => handleSend()} disabled={isLoading || (!input.trim())} className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 active:scale-95"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;