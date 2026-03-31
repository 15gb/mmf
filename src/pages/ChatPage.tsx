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

  // 최신 상태를 참조하기 위한 Ref (원본 로직 보존)
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const allConvsRef = useRef(allConversations);

  useEffect(() => {
    messagesRef.current = messages;
    settingsRef.current = settings;
    allConvsRef.current = allConversations;
  }, [messages, settings, allConversations]);

  const charName = settings.charName || "AI 캐릭터";

  // URL 파라미터를 통한 대화 로드 로직 (원본 보존)
  useEffect(() => {
    const loadId = searchParams.get("load");
    const isNew = searchParams.get("new");
    if (isNew) {
      clearMessages();
      setCurrentConvId(null);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // 첫 인사말 자동 생성 로직
  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, [settings.charGreeting, addMessage, messages.length]);

  // 우클릭/롱탭 메뉴 닫기 핸들러 (원본 보존)
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu]);

  // 🚪 페이지 이탈 시 자동 저장 (5중 로테이션 연동)
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
    return (settings.charName || "새 대화").trim().slice(0, 30);
  }, [settings.charName]);

  /** 💾 수동 저장 (캐릭터 이름 기반 저장 + 중복 확인창 로직 완벽 복구) */
  const handleSave = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }

    const currentTitle = getDefaultSaveTitle();
    
    if (currentConvId) {
      await saveConversation(messages, { existingId: currentConvId, title: currentTitle, settings });
      toast.success("대화 내용이 업데이트되었습니다");
      return;
    }

    const sameTitleConv = allConvsRef.current.find(c => c.title === currentTitle);

    if (sameTitleConv) {
      const overwrite = window.confirm(`"${currentTitle}" 이름으로 저장된 대화가 이미 있습니다. 해당 슬롯에 덮어쓰시겠습니까?`);
      if (overwrite) {
        await saveConversation(messages, { existingId: sameTitleConv.id, title: currentTitle, settings });
        setCurrentConvId(sameTitleConv.id);
        toast.success("기존 슬롯에 덮어쓰기 완료!");
      } else {
        const newTitle = window.prompt("새로운 저장 제목을 입력해주세요:", `${currentTitle} (새 대화)`);
        if (newTitle) {
          const id = await saveConversation(messages, { title: newTitle, settings });
          if (id) setCurrentConvId(id);
          toast.success("새로운 슬롯에 저장되었습니다");
        }
      }
    } else {
      const id = await saveConversation(messages, { title: currentTitle, settings });
      if (id) {
        setCurrentConvId(id);
        toast.success("대화가 저장되었습니다");
      }
    }
  }, [messages, currentConvId, saveConversation, settings, getDefaultSaveTitle]);

  /** 🚀 전송 핸들러 (대화 중심 스타일 + 에러 수정) */
  const handleSend = useCallback(async (overrideContent?: string) => {
    const isAuto = overrideContent === "[AUTO]";
    const isSummon = overrideContent === "[SUMMON_EXTRA]";
    const content = (isAuto || isSummon) ? "" : (overrideContent !== undefined ? overrideContent : input.trim());
    
    if (!isAuto && !isSummon && content === "" && overrideContent === undefined) return;
    if (isLoading) return;

    if (!content.startsWith("[SYSTEM]") && content !== "" && !isAuto && !isSummon) {
      addMessage({ role: "user", content });
    }
    
    setInput("");
    setIsLoading(true);

    // 🌟 핵심: 대화 중심 시스템 지침 (나레이션 축소, 대사 50% 이상)
    let systemPrompt = `너는 "${settings.charName}"를 연기하는 숙련된 역할극 작가이다. 유저의 이름은 "${settings.myName}"이다.
성격: ${settings.charPersona}, 세계관: ${settings.worldSetting}

[채팅 스타일 규칙]
1. **대화 비중 강화:** 답변 내용의 **절반 이상(최소 50% 이상)은 반드시 캐릭터의 직접적인 대사(""로 감싼 텍스트)**로 구성하라.
2. **나레이션 최적화:** 행동, 표정, 배경 묘사는 별표(*)로 감싸되, 대화의 생동감을 돕는 수준으로 핵심만 짧게 서술하라.
3. **길이 제한:** 답변은 전체적으로 **약 5~8문장 사이**로 유지하라. (불필요한 상황 설명보다는 캐릭터 간의 상호작용에 집중하라.)
4. **시점 유지:** 제3자적인 설명보다는 캐릭터가 유저에게 직접 반응하고 말을 거는 느낌을 강조하라.`;

    if (isAuto) {
      systemPrompt += `\n\n[특수: 자동 진행] 유저(나)의 입력이 없으므로, 이전 흐름에 맞춰 유저 캐릭터("${settings.myName}")가 할 법한 짧은 말과 행동을 네가 대신 작성하고, 그에 대한 너의 반응을 대화 중심으로 연결하라.`;
    } else if (isSummon) {
      systemPrompt += `\n\n[특수: 엑스트라 등장] 현재 상황에 맞는 새로운 인물을 등장시켜 짧고 강렬한 대화를 주고받아라.`;
    } else {
      systemPrompt += `\n\n[특수: 일반 대화] 유저("${settings.myName}")의 메시지에 대해 "${settings.charName}"의 입장에서 대화하고 반응하라. 유저의 행동을 네가 임의로 결정하지 마라.`;
    }

    const history = messages.slice(-15).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
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
          if (fullContent && fullContent.includes(SPLIT_MARKER)) {
            const parts = fullContent.split(SPLIT_MARKER).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              updateLastAssistant(parts[0]);
              for (let i = 1; i < parts.length; i++) addMessage({ role: "assistant", content: parts[i] });
            }
          }
        },
        onError: (err) => {
          // ⭐ e.onError is not a function 에러 해결
          setIsLoading(false);
          const errorMsg = typeof err === 'string' ? err : "통신 중 오류가 발생했습니다.";
          toast.error(errorMsg);
        }
      });
    } catch (error: any) { 
      setIsLoading(false); 
      toast.error(error.message || "오류가 발생했습니다."); 
    }
  }, [input, isLoading, messages, settings, addMessage, updateLastAssistant]);

  const handleNarration = useCallback(() => {
    if (isLoading) return;
    const trimmed = input.trim();
    if (trimmed) handleSend(`*${trimmed}*`);
    else setInput("*");
  }, [input, isLoading, handleSend]);

  const handleSummonCharacter = useCallback(() => {
    if (isLoading) return;
    handleSend("[SUMMON_EXTRA]");
  }, [isLoading, handleSend]);

  /** 🎨 이미지 생성 (toastId 오류 해결본) */
  const handleGenerateImage = useCallback(async () => {
    if (isLoading || isGeneratingImage) return;
    setIsGeneratingImage(true);
    const toastId = toast.loading("현재 장면을 분석하여 이미지를 생성 중...");
    try {
      const { imageUrl, prompt } = await generateImage(messages, settings, (status) => toast.loading(status, { id: toastId }));
      addMessage({ role: "assistant", content: encodeImageMessage(imageUrl, prompt) });
      toast.success("이미지가 성공적으로 생성되었습니다!", { id: toastId });
    } catch (e: any) { 
      toast.error(e.message || "이미지 생성에 실패했습니다.", { id: toastId }); 
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
    
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*") && msg.content.length > 2;
    if (isNarration) {
      return <span className="italic text-muted-foreground/80">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
  };

  /** 🖼️ 배경 이미지 스타일 */
  const backgroundStyle = settings.chatBackground ? {
    backgroundImage: `url(${settings.chatBackground})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed" as const
  } : {};

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 z-20">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold overflow-hidden shrink-0">
            {settings.charAvatar ? (
              <img src={settings.charAvatar} className="w-full h-full object-cover" alt="avatar" />
            ) : charName[0]}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight truncate max-w-[120px]">{charName}</p>
            <p className="text-xs text-muted-foreground">캐릭터 설정</p>
          </div>
        </button>
        <div className="flex gap-1 text-muted-foreground">
          <button onClick={handleGenerateImage} title="이미지 생성" className="p-2 hover:text-primary transition-colors">
            {isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          </button>
          <button onClick={handleSave} title="수동 저장" className="p-2 hover:text-primary transition-colors">
            <Save size={18} />
          </button>
          <button onClick={() => navigate("/conversations")} title="목록 보기" className="p-2 hover:text-foreground transition-colors">
            <List size={18} />
          </button>
          <button onClick={() => { if(window.confirm("정말 현재 대화를 모두 지울까요?")) clearMessages(); }} title="대화 초기화" className="p-2 hover:text-destructive transition-colors">
            <Trash2 size={18} />
          </button>
          <button onClick={() => navigate("/settings")} title="전체 설정" className="p-2 hover:text-foreground transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto px-3 py-4 space-y-4 relative" 
        style={backgroundStyle}
      >
        {messages.map((msg) => {
          const isExtra = msg.role === "assistant" && (msg.content.trim().startsWith("**") || !msg.content.includes(settings.charName));
          
          return (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} relative z-10`}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY }); }}
            >
              {msg.role === "assistant" && !isExtra && (
                 <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold mr-2 mt-1 shrink-0 overflow-hidden">
                   {settings.charAvatar ? <img src={settings.charAvatar} className="w-full h-full object-cover" alt="avatar" /> : charName[0]}
                 </div>
              )}
              {isExtra && <div className="w-9" />}
              
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
        {isLoading && (
          <div className="flex justify-start pl-9">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        )}
      </div>

      {contextMenu && (
        <div 
          className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" 
          style={{ left: contextMenu.x, top: contextMenu.y }} 
          onClick={() => setContextMenu(null)}
        >
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={() => { deleteMessage(contextMenu.id); toast.success("메시지가 삭제되었습니다"); }}>
            <X size={14} /> 메시지 삭제
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors" onClick={() => { deleteMessagesFrom(contextMenu.id); toast.success("해당 지점 이후 대화가 삭제되었습니다"); }}>
            <Scissors size={14} /> 여기부터 이후 삭제
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-card px-3 py-3 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend(input.trim() === "" ? "[AUTO]" : undefined))} 
            placeholder="메시지를 입력하세요..." 
            rows={1} 
            className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 max-h-32" 
          />
          <button 
            onClick={handleNarration} 
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent active:scale-90 transition-all"
            title="나레이션 모드 (*사용)"
          >
            <Star size={18} />
          </button>
          <button 
            onClick={handleSummonCharacter} 
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary active:scale-90 transition-all"
            title="엑스트라 등장"
          >
            <Users size={18} />
          </button>
          <button 
            onClick={() => handleSend(input.trim() === "" ? "[AUTO]" : undefined)} 
            disabled={isLoading} 
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shadow-md"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;