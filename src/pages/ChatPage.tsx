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

  // URL 파라미터 로딩 (원본 로직 유지)
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (searchParams.get("new")) {
      clearMessages(); setCurrentConvId(null);
      setSearchParams({}, { replace: true });
    } else if (loadId) {
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

  // 우클릭 메뉴 닫기 핸들러 (원본 로직 유지)
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [contextMenu]);

  // 페이지 나갈 때 자동 저장 (1~5번 슬롯 로테이션 연동)
  useEffect(() => {
    const handleExit = () => { if (msgRef.current.length > 0) autoSaveConversation(msgRef.current, setRef.current); };
    window.addEventListener("beforeunload", handleExit);
    return () => { window.removeEventListener("beforeunload", handleExit); handleExit(); };
  }, [autoSaveConversation]);

  const getDefaultSaveTitle = useCallback(() => (settings.charName || "새 대화").trim().slice(0, 30), [settings.charName]);

  /** 💾 수동 저장 (원본의 중복 확인 및 캐릭터 이름 저장 방식 복구) */
  const handleSave = useCallback(async () => {
    if (messages.length === 0) { toast.error("저장할 대화가 없습니다"); return; }
    const currentTitle = getDefaultSaveTitle();

    if (currentConvId) {
      await saveConversation(messages, { existingId: currentConvId, title: currentTitle, settings });
      toast.success("대화가 업데이트되었습니다");
      return;
    }

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

  /** 🚀 전송 핸들러 (공백 자동진행 및 엑스트라 소환 기능 통합) */
  const handleSend = useCallback(async (overrideContent?: string) => {
    const isAuto = overrideContent === "[AUTO]";
    const isSummon = overrideContent === "[SUMMON_EXTRA]";
    
    // 내용 결정: 자동진행/엑스트라면 공백, 아니면 입력값
    const content = (isAuto || isSummon) ? "" : (overrideContent !== undefined ? overrideContent : input.trim());
    
    // 일반 전송인데 내용이 없으면 중단 (자동진행 버튼이나 엔터 공백 전송은 허용)
    if (!isAuto && !isSummon && content === "" && overrideContent === undefined) return;
    if (isLoading) return;

    // 유저 메시지 표시 (시스템 명령이나 공백 진행이 아닐 때만)
    if (!content.startsWith("[SYSTEM]") && content !== "" && !isAuto && !isSummon) {
      addMessage({ role: "user", content });
    }
    
    setInput("");
    setIsLoading(true);

    // 시스템 프롬프트 구성 (원본 지침 + 요청 기능)
    let systemPrompt = `너는 "${settings.charName}"를 연기하는 작가이다.\n성격: ${settings.charPersona}\n세계관: ${settings.worldSetting}\n[지침]\n1. 행동/환경 묘사는 별표(*)로 감싸라.\n2. 대사는 따옴표("")를 사용하라.\n3. 응답은 최소 5줄 이상 길게 작성하라.`;

    if (isAuto) {
      systemPrompt += `\n[상황 자동 진행] 유저의 입력이 없으므로, 현재 맥락에 맞춰 상황을 이어가라. 유저의 캐릭터 행동과 메인 캐릭터의 반응을 모두 묘사하고 필요하면 대화를 진행하라.`;
    } else if (isSummon) {
      systemPrompt += `\n[엑스트라 등장] 현재 맥락에 맞는 새로운 조연(엑스트라)을 반드시 등장시켜라. 이름은 네가 맥락에 맞게 정하고 캐릭터 아바타는 사용하지 않을 것이니 이름과 대사를 풍부하게 묘사하라.`;
    }

    const history = messages.slice(-10).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[기록]\n${history}\n\nUser: ${content}\n\nAI:`;

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
    // 엑스트라 소환 명령 전송
    handleSend("[SUMMON_EXTRA]");
  }, [isLoading, handleSend]);

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
        <div className="prose prose-sm prose-invert max-w-none 
          [&_em]:not-italic [&_em]:text-muted-foreground/70 [&_em]:font-normal
          [&_p]:m-0 [&_p+p]:mt-2">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }
    
    // 유저 나레이션 처리
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*") && msg.content.length > 2;
    if (isNarration) {
      return <span className="italic text-muted-foreground/80">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {settings.charAvatar ? (
              <img 
                src={settings.charAvatar} 
                className="w-full h-full rounded-full object-cover" 
                alt="avatar" 
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : charName[0]}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">{charName}</p>
            <p className="text-xs text-muted-foreground">설정창</p>
          </div>
        </button>
        <div className="flex gap-1 text-muted-foreground">
          <button onClick={handleGenerateImage} className="p-2 hover:text-primary transition-colors">
            {isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          </button>
          <button onClick={handleSave} className="p-2 hover:text-primary transition-colors">
            <Save size={18} />
          </button>
          <button onClick={() => navigate("/conversations")} className="p-2 hover:text-foreground transition-colors">
            <List size={18} />
          </button>
          <button onClick={() => { if(window.confirm("대화를 초기화할까요?")) clearMessages(); }} className="p-2 hover:text-destructive transition-colors">
            <Trash2 size={18} />
          </button>
          <button onClick={() => navigate("/settings")} className="p-2 hover:text-foreground transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto px-3 py-4 space-y-4 relative" 
        style={settings.chatBackground ? { backgroundImage: `url(${settings.chatBackground})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {messages.map((msg) => {
          // 엑스트라 판별 (볼드체 이름이 앞에 오거나 메인 캐릭터 이름이 없는 경우)
          const isExtra = msg.role === "assistant" && (msg.content.trim().startsWith("**") || !msg.content.includes(settings.charName));
          
          return (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} relative z-10`}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY }); }}
            >
              {/* 메인 캐릭터 대화일 때만 아바타 노출 (엑스트라는 공백) */}
              {msg.role === "assistant" && !isExtra && (
                 <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold mr-2 mt-1 shrink-0">
                   {settings.charAvatar ? <img src={settings.charAvatar} className="w-full h-full rounded-full object-cover" alt="avatar" /> : charName[0]}
                 </div>
              )}
              {isExtra && <div className="w-9" />} {/* 엑스트라용 아바타 공간 비우기 */}
              
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === "user" 
                  ? "bg-primary text-primary-foreground rounded-br-none" 
                  : "bg-card border border-border rounded-bl-none text-foreground"
              }`}>
                {renderContent(msg)}
              </div>
            </div>
          );
        })}
        {isLoading && <div className="flex justify-start"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>}
      </div>

      {contextMenu && (
        <div 
          className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" 
          style={{ left: contextMenu.x, top: contextMenu.y }} 
          onClick={() => setContextMenu(null)}
        >
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted" onClick={() => { deleteMessage(contextMenu.id); toast.success("삭제되었습니다"); }}>
            <X size={14} /> 삭제
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted" onClick={() => { deleteMessagesFrom(contextMenu.id); toast.success("이후 메시지 삭제됨"); }}>
            <Scissors size={14} /> 여기까지 삭제
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-card px-3 py-3 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend(input.trim() === "" ? "[AUTO]" : undefined))} 
            placeholder="메시지..." 
            rows={1} 
            className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 max-h-32" 
          />
          <button 
            onClick={handleNarration} 
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent active:scale-90 transition-all"
            title="나레이션 모드"
          >
            <Star size={18} />
          </button>
          {/* 🌟 엑스트라 소환 버튼 복구 */}
          <button 
            onClick={handleSummonCharacter} 
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-90 transition-all"
            title="조연/엑스트라 소환"
          >
            <Users size={18} />
          </button>
          <button 
            onClick={() => handleSend(input.trim() === "" ? "[AUTO]" : undefined)} 
            disabled={isLoading} 
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;