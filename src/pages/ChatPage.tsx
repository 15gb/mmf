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

  // 최신 상태를 참조하기 위한 Ref
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
    
    // 1. 이미 현재 대화 슬롯 ID가 할당되어 있는 경우
    if (currentConvId) {
      await saveConversation(messages, { existingId: currentConvId, title: currentTitle, settings });
      toast.success("대화 내용이 업데이트되었습니다");
      return;
    }

    // 2. 전체 목록에서 동일한 캐릭터명(제목)이 있는지 확인
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
      // 3. 중복이 없는 경우 새로 저장
      const id = await saveConversation(messages, { title: currentTitle, settings });
      if (id) {
        setCurrentConvId(id);
        toast.success("대화가 저장되었습니다");
      }
    }
  }, [messages, currentConvId, saveConversation, settings, getDefaultSaveTitle]);

  /** 🚀 전송 및 자동 진행 핸들러 (풍부한 묘사 + 모드별 지침 분리) */
  const handleSend = useCallback(async (overrideContent?: string) => {
    const isAuto = overrideContent === "[AUTO]";
    const isSummon = overrideContent === "[SUMMON_EXTRA]";
    const content = (isAuto || isSummon) ? "" : (overrideContent !== undefined ? overrideContent : input.trim());
    
    if (!isAuto && !isSummon && content === "" && overrideContent === undefined) return;
    if (isLoading) return;

    // 유저 메시지를 화면에 표시 (공백 자동진행이나 시스템 명령이 아닐 때만)
    if (!content.startsWith("[SYSTEM]") && content !== "" && !isAuto && !isSummon) {
      addMessage({ role: "user", content });
    }
    
    setInput("");
    setIsLoading(true);

    // 🌟 핵심: 소설가 페르소나 지침 (절대 간결 금지)
    let systemPrompt = `너는 "${settings.charName}"를 연기하는 숙련된 소설 작가이다. 유저의 이름은 "${settings.myName}"이다.
성격: ${settings.charPersona}, 세계관: ${settings.worldSetting}, 배경 설정: ${settings.worldSetting}

[필수 응답 규칙]
1. 행동, 표정, 미세한 심리 상태, 주변 환경의 공기 흐름까지 반드시 별표(*)로 감싸 아주 풍부하고 생생하게 묘사하라.
2. 모든 캐릭터의 대사는 반드시 따옴표("")를 사용하라.
3. **지침: 절대로 간결하게 쓰지 마라.** 한 장면을 머릿속에 그려내듯 소설처럼 깊이 있고 상세하게 서술하라. 최소 3문단 이상의 풍부한 텍스트를 구성하라.
4. 나레이션과 대사를 조화롭게 섞어 하나의 완성된 장면을 그려내라.`;

    if (isAuto) {
      // 🌟 공백 전송 시: 내 캐릭터 대행 지침
      systemPrompt += `\n\n[특수 지침: 상황 자동 진행] 유저(나)의 입력이 없으므로, 네가 이전 맥락을 깊이 참고하여 유저 캐릭터("${settings.myName}")가 할 법한 행동과 대사를 대신 작성하고, 그에 반응하는 "${settings.charName}"의 모습까지 한꺼번에 장문으로 서술하여 이야기를 자연스럽게 이어가라.`;
    } else if (isSummon) {
      // 🌟 엑스트라 소환 시 지침
      systemPrompt += `\n\n[특수 지침: 엑스트라 등장] 현재 분위기에 걸맞은 새로운 조연(엑스트라)을 등장시켜라. 그 인물의 외양, 직업, 말투를 풍부하게 묘사하며 상황을 이끌어라.`;
    } else {
      // 🌟 일반 대화 시 지침
      systemPrompt += `\n\n[특수 지침: 일반 반응] 오직 유저("${settings.myName}")의 입력에만 집중하라. 유저의 행동을 네가 임의로 결정하지 말고, 유저의 입력에 대한 "${settings.charName}"의 입체적인 반응과 그로 인해 변화하는 주변 상황을 상세히 묘사하라.`;
    }

    const history = messages.slice(-15).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[현재까지의 대화 기록]\n${history}\n\nUser: ${content}\n\nAI:`;

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
          // SPLIT_MARKER가 있을 경우 처리 (복수 응답 분할 로직)
          if (fullContent && fullContent.includes(SPLIT_MARKER)) {
            const parts = fullContent.split(SPLIT_MARKER).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              updateLastAssistant(parts[0]);
              for (let i = 1; i < parts.length; i++) addMessage({ role: "assistant", content: parts[i] });
            }
          }
        },
        onError: (err) => {
          // ⭐ e.onError is not a function 에러 완전 해결
          setIsLoading(false);
          const errorMsg = typeof err === 'string' ? err : "통신 중 오류가 발생했습니다.";
          toast.error(errorMsg);
          console.error("StreamChat Error:", err);
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

  /** 🎨 이미지 생성 (tid 오류 해결본) */
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
    
    // 유저의 나레이션(*) 스타일 처리
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*") && msg.content.length > 2;
    if (isNarration) {
      return <span className="italic text-muted-foreground/80">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
  };

  /** 🖼️ 배경 이미지 스타일 (검은 오버레이 없이 원본 출력) */
  const backgroundStyle = settings.chatBackground ? {
    backgroundImage: `url(${settings.chatBackground})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed" as const
  } : {};

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* 🔹 Header Section */}
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

      {/* 🔹 Chat Area Section */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto px-3 py-4 space-y-4 relative" 
        style={backgroundStyle}
      >
        {messages.map((msg) => {
          // 엑스트라 체크 로직
          const isExtra = msg.role === "assistant" && (msg.content.trim().startsWith("**") || !msg.content.includes(settings.charName));
          
          return (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} relative z-10`}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY }); }}
            >
              {/* 메인 캐릭터일 때만 아바타 노출 */}
              {msg.role === "assistant" && !isExtra && (
                 <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold mr-2 mt-1 shrink-0 overflow-hidden">
                   {settings.charAvatar ? <img src={settings.charAvatar} className="w-full h-full object-cover" alt="avatar" /> : charName[0]}
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
        {isLoading && (
          <div className="flex justify-start pl-9">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        )}
      </div>

      {/* 🔹 Context Menu Section (원본 보존) */}
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

      {/* 🔹 Input Section */}
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