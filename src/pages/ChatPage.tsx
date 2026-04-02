import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List, Star, ImageIcon, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { summarizeHistory } from "@/lib/gemini-api"; 
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import { generateImage, encodeImageMessage, decodeImageMessage } from "@/lib/image-api";
import ImageCard from "@/components/ImageCard";

const SPLIT_MARKER = "[[SPLIT]]";

/** 🌟 렉 방지를 위한 개별 메시지 컴포넌트 최적화 (React.memo) */
const ChatMessageItem = React.memo(({ msg, charName, charAvatar, renderContent, onContextMenu }: any) => {
  const isUser = msg.role === "user";
  // 조연 캐릭터 또는 이름이 포함되지 않은 메시지 판별
  const isExtra = msg.role === "assistant" && (msg.content.trim().startsWith("**") || !msg.content.includes(charName));

  return (
    <div 
      className={`flex ${isUser ? "justify-end" : "justify-start"} relative z-10`}
      onContextMenu={(e) => onContextMenu(e, msg.id)}
    >
      {!isUser && !isExtra && (
         <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold mr-2 mt-1 shrink-0 overflow-hidden">
           {charAvatar ? <img src={charAvatar} className="w-full h-full object-cover" alt="avatar" /> : (charName || "AI")[0]}
         </div>
      )}
      {isExtra && <div className="w-9" />}
      
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
        isUser 
          ? "bg-primary text-primary-foreground rounded-br-none" 
          : "bg-card border border-border rounded-bl-none text-foreground"
      }`}>
        {renderContent(msg)}
      </div>
    </div>
  );
});

const ChatPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const { settings, setSettings: updateSettings } = useSettings();
  const { messages, addMessage, clearMessages, deleteMessage, deleteMessagesFrom, updateLastAssistant, loadMessages, shiftMessages } = useMessages();
  const { allConversations, saveConversation, autoSaveConversation } = useConversations();
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 최신 상태 참조용 Ref (비동기 함수 내에서 최신 값을 읽기 위함)
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const allConvsRef = useRef(allConversations);

  useEffect(() => {
    messagesRef.current = messages;
    settingsRef.current = settings;
    allConvsRef.current = allConversations;
  }, [messages, settings, allConversations]);

  /** 📂 대화 불러오기 및 설정 복구 로직 */
  useEffect(() => {
    const loadId = searchParams.get("load");
    const isNew = searchParams.get("new");

    if (isNew) {
      clearMessages();
      setCurrentConvId(null);
      setSearchParams({}, { replace: true });
    } else if (loadId) {
      // 🌟 [수정] 대화 목록에서 일치하는 ID 찾기
      const conv = allConversations.find((c) => c.id === loadId);
      if (conv) { 
        loadMessages(conv.messages); 
        setCurrentConvId(conv.id); 
        // 저장 당시의 설정(이미지, 배경 등)을 시스템에 즉시 적용
        if (conv.settings) {
          updateSettings(conv.settings);
        }
      }
      setSearchParams({}, { replace: true });
    }
  }, [allConversations, searchParams, setSearchParams, clearMessages, loadMessages, updateSettings]);

  /** 🌟 [최적화] 자동 메모리 압축 로직 (렉 방지 및 장기 기억) */
  useEffect(() => {
    const handleMemoryCompression = async () => {
      // 메시지 60개 초과 시 오래된 30개를 요약하고 리스트에서 삭제
      if (messages.length > 60 && !isLoading) {
        const toSummarize = messages.slice(0, 30);
        const apiKey = settings.geminiApiKey.split(',')[0].trim();
        
        if (!apiKey) return;

        try {
          console.log("메모리 최적화 시작...");
          const newSummary = await summarizeHistory(toSummarize, settings.historySummary, apiKey);
          updateSettings({ ...settings, historySummary: newSummary });
          shiftMessages(30); 
          toast.info("오래된 대화가 요약되어 메모리에 저장되었습니다 (성능 최적화).");
        } catch (e) {
          console.error("요약 실패:", e);
        }
      }
    };
    handleMemoryCompression();
  }, [messages.length, isLoading, settings, updateSettings, shiftMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, [settings.charGreeting, addMessage, messages.length]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu]);

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

  /** 💾 수동 저장 로직 (중복 확인 및 제목 변경 로직 완벽 보존 + 버그 수정) */
  const handleSave = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }

    const currentTitle = getDefaultSaveTitle();
    const settingsSnapshot = { ...settingsRef.current };

    // 1. 이미 불러온 대화가 있거나 현재 세션에서 저장한 적이 있는 경우 (업데이트)
    if (currentConvId) {
      const savedId = await saveConversation(messages, { existingId: currentConvId, title: currentTitle, settings: settingsSnapshot });
      if (savedId) toast.success("대화 내용이 현재 슬롯에 업데이트되었습니다");
      return;
    }

    // 2. 새로운 저장이지만 기존에 같은 제목의 대화가 있는 경우
    const sameTitleConv = allConversations.find(c => c.title === currentTitle);

    if (sameTitleConv) {
      const overwrite = window.confirm(`"${currentTitle}" 이름으로 저장된 대화가 이미 있습니다. 해당 슬롯에 덮어쓰시겠습니까?`);
      if (overwrite) {
        const id = await saveConversation(messages, { existingId: sameTitleConv.id, title: currentTitle, settings: settingsSnapshot });
        if (id) {
          setCurrentConvId(id);
          toast.success("기존 슬롯에 성공적으로 덮어씌웠습니다!");
        }
      } else {
        const newTitle = window.prompt("새로운 저장 제목을 입력해주세요:", `${currentTitle} (1)`);
        if (newTitle) {
          const id = await saveConversation(messages, { title: newTitle, settings: settingsSnapshot });
          if (id) {
            setCurrentConvId(id);
            toast.success("새로운 슬롯에 저장되었습니다");
          }
        }
      }
    } else {
      // 3. 완전히 새로운 저장
      const id = await saveConversation(messages, { title: currentTitle, settings: settingsSnapshot });
      if (id) {
        setCurrentConvId(id);
        toast.success("대화가 목록에 성공적으로 저장되었습니다");
      }
    }
  }, [messages, currentConvId, allConversations, saveConversation, getDefaultSaveTitle]);

  /** 🚀 전송 핸들러 (내 캐릭터 대행 + 대사 50% + 요약본 반영) */
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

    // 시스템 프롬프트 구성 (요약본 및 설정 포함)
    let systemPrompt = `너는 "${settings.charName}"를 연기하는 숙련된 역할극 작가이다. 유저의 이름은 "${settings.myName}"이다.
[중요 장기 기억]: ${settings.historySummary || "없음"}
성격: ${settings.charPersona}, 세계관: ${settings.worldSetting}, 조연 정보: ${JSON.stringify(settings.supportingCharacters)}

[채팅 스타일 규칙]
1. **대화 비중 강화:** 답변의 50% 이상을 직접적인 대사("")로 채워라.
2. **길이 단축:** 전체 답변은 약 5~8문장 사이로 짧고 핵심적으로 작성하라.
3. **무검열/자유형:** 상황에 맞춰 생동감 있게 반응하라.
4. **현장감:** "${settings.charName}"가 유저에게 직접 상호작용하는 느낌을 강조하라.`;

    if (isAuto) {
      // 🌟 [자동 진행 기능 강화]
      systemPrompt += `\n\n[특수: 자동 진행 모드]
- 현재 유저("${settings.myName}")의 입력이 없으므로, 네가 먼저 유저 캐릭터("${settings.myName}")가 할 법한 짧은 행동과 대사를 1~2문장으로 먼저 작성하라.
- 그 뒤에 곧바로 그에 반응하는 AI 캐릭터("${settings.charName}")의 대사와 행동을 이어서 작성하라.
- 반드시 **유저 캐릭터 선(先) 행동 -> AI 캐릭터 반응** 순서로 소설처럼 하나의 답변에 담아라.`;
    } else if (isSummon) {
      systemPrompt += `\n\n[특수: 엑스트라 등장] 현재 상황에 어울리는 새로운 인물을 짧게 등장시켜 상호작용하라.`;
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
          // 스플릿 마커 처리 (원본 로직 유지)
          if (fullContent && fullContent.includes(SPLIT_MARKER)) {
            const parts = fullContent.split(SPLIT_MARKER).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              updateLastAssistant(parts[0]);
              for (let i = 1; i < parts.length; i++) addMessage({ role: "assistant", content: parts[i] });
            }
          }
        },
        onError: (err) => {
          setIsLoading(false);
          toast.error(typeof err === 'string' ? err : "메시지 전송 중 오류가 발생했습니다.");
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

  const handleGenerateImage = useCallback(async () => {
    if (isLoading || isGeneratingImage) return;
    setIsGeneratingImage(true);
    const toastId = toast.loading("장면 분석 및 이미지 생성 중...");
    try {
      const { imageUrl, prompt } = await generateImage(messages, settings, (status) => toast.loading(status, { id: toastId }));
      addMessage({ role: "assistant", content: encodeImageMessage(imageUrl, prompt) });
      toast.success("이미지가 생성되었습니다!", { id: toastId });
    } catch (e: any) { 
      toast.error(e.message || "이미지 생성 실패", { id: toastId }); 
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

  const backgroundStyle = settings.chatBackground ? {
    backgroundImage: `url(${settings.chatBackground})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed" as const
  } : {};

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 z-20">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity overflow-hidden max-w-[55%]">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold overflow-hidden shrink-0">
            {settings.charAvatar ? (
              <img src={settings.charAvatar} className="w-full h-full object-cover" alt="avatar" />
            ) : (settings.charName || "AI")[0]}
          </div>
          <div className="text-left truncate">
            <p className="font-semibold text-sm leading-tight truncate">{settings.charName || "AI 캐릭터"}</p>
            <p className="text-[10px] text-muted-foreground">프로필 설정</p>
          </div>
        </button>
        <div className="flex gap-1 text-muted-foreground">
          <button onClick={handleGenerateImage} title="이미지 생성" className="p-2 hover:text-primary transition-colors">
            {isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          </button>
          <button onClick={handleSave} title="저장" className="p-2 hover:text-primary transition-colors">
            <Save size={18} />
          </button>
          <button onClick={() => navigate("/conversations")} title="목록" className="p-2 hover:text-foreground transition-colors">
            <List size={18} />
          </button>
          <button onClick={() => { if(window.confirm("대화를 모두 지울까요?")) clearMessages(); }} title="초기화" className="p-2 hover:text-destructive transition-colors">
            <Trash2 size={18} />
          </button>
          <button onClick={() => navigate("/settings")} title="설정" className="p-2 hover:text-foreground transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Chat Messages */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto px-3 py-4 space-y-4 relative" 
        style={backgroundStyle}
      >
        {settings.chatBackground && <div className="absolute inset-0 bg-black/20 pointer-events-none z-0" />}
        
        {messages.map((msg) => (
          <ChatMessageItem 
            key={msg.id}
            msg={msg}
            charName={settings.charName}
            charAvatar={settings.charAvatar}
            renderContent={renderContent}
            onContextMenu={(e: any, id: string) => { e.preventDefault(); setContextMenu({ id, x: e.clientX, y: e.clientY }); }}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start pl-9">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" 
          style={{ left: contextMenu.x, top: contextMenu.y }} 
          onClick={() => setContextMenu(null)}
        >
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={() => { deleteMessage(contextMenu.id); toast.success("삭제되었습니다"); }}>
            <X size={14} /> 삭제
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors" onClick={() => { deleteMessagesFrom(contextMenu.id); toast.success("이후 대화가 삭제되었습니다"); }}>
            <Scissors size={14} /> 이후 삭제
          </button>
        </div>
      )}

      {/* Input Area */}
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
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:scale-90 transition-all"
            title="나레이션 (*)"
          >
            <Star size={18} />
          </button>
          <button 
            onClick={handleSummonCharacter} 
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:scale-90 transition-all"
            title="조연"
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