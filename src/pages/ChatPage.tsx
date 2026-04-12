import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List, Star, ImageIcon, Users, Edit3 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import { generateImage, encodeImageMessage, decodeImageMessage } from "@/lib/image-api";
import ImageCard from "@/components/ImageCard";

const SPLIT_MARKER = "[[SPLIT]]";

const ChatMessageItem = React.memo(({ msg, charName, charAvatar, renderContent, onContextMenu }: any) => {
  const isUser = msg.role === "user";
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
  const { messages, addMessage, editMessage, clearMessages, deleteMessage, deleteMessagesFrom, updateLastAssistant, loadMessages } = useMessages();
  const { allConversations, saveConversation, autoSaveConversation } = useConversations();
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const autoSaveRef = useRef(autoSaveConversation);

  useEffect(() => {
    messagesRef.current = messages;
    settingsRef.current = settings;
    autoSaveRef.current = autoSaveConversation;
  }, [messages, settings, autoSaveConversation]);

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
        if (conv.settings) updateSettings(conv.settings);
      }
      setSearchParams({}, { replace: true });
    }
  }, [allConversations, searchParams, setSearchParams, clearMessages, loadMessages, updateSettings]);

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
        autoSaveRef.current(messagesRef.current, settingsRef.current);
      }
    };
    window.addEventListener("beforeunload", handleExitSave);
    
    return () => {
      window.removeEventListener("beforeunload", handleExitSave);
      handleExitSave();
    };
  }, []);

  const getDefaultSaveTitle = useCallback(() => {
    return (settings.charName || "새 대화").trim().slice(0, 30);
  }, [settings.charName]);

  const handleSave = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }

    const currentTitle = getDefaultSaveTitle();
    const settingsSnapshot = { ...settingsRef.current };

    if (currentConvId) {
      const savedId = await saveConversation(messages, { existingId: currentConvId, title: currentTitle, settings: settingsSnapshot });
      if (savedId) toast.success("대화 내용이 현재 슬롯에 업데이트되었습니다");
      return;
    }

    const sameTitleConv = allConversations.find(c => c.title === currentTitle);

    if (sameTitleConv) {
      const overwrite = window.confirm(`"${currentTitle}" 이름으로 저장된 대화가 이미 있습니다. 해당 슬롯에 덮어쓰시겠습니까?`);
      if (overwrite) {
        const id = await saveConversation(messages, { existingId: sameTitleConv.id, title: currentTitle, settings: settingsSnapshot });
        if (id) {
          setCurrentConvId(id);
          toast.success("기존 슬롯에 덮어쓰기 완료!");
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
      const id = await saveConversation(messages, { title: currentTitle, settings: settingsSnapshot });
      if (id) {
        setCurrentConvId(id);
        toast.success("대화가 저장되었습니다");
      }
    }
  }, [messages, currentConvId, allConversations, saveConversation, getDefaultSaveTitle]);

  /** 🚀 1. 전송 핸들러 (자동 진행 기능 완벽 픽스) */
  const handleSend = useCallback(async (overrideContent?: string) => {
    const isAuto = overrideContent === "[AUTO]";
    const content = isAuto ? "" : (overrideContent !== undefined ? overrideContent : input.trim());
    
    if (!isAuto && content === "") return;
    if (isLoading) return;

    if (!content.startsWith("[SYSTEM]") && content !== "" && !isAuto) {
      addMessage({ role: "user", content });
    }
    
    setInput("");
    setIsLoading(true);

    let systemPrompt = `너는 "${settings.charName}"를 연기하는 숙련된 역할극 작가이다. 유저의 이름은 "${settings.myName}"이다.
성격: ${settings.charPersona}, 세계관: ${settings.worldSetting}, 조연 정보: ${JSON.stringify(settings.supportingCharacters)}

[채팅 작성 절대 규칙]
1. **대화 비중 극대화:** 답변의 70% 이상을 캐릭터의 직접적인 대사("")로 구성하라. 나레이션은 최소화하라.
2. **분량 엄수:** 공백 포함 **최소 200자 이상, 최대 500자 이내**로 작성하라.
3. **자동 분할:** 답변이 500자를 초과할 것 같으면, 반드시 중간에 \`${SPLIT_MARKER}\` 마커를 삽입하여 두 개의 덩어리로 나누어라.
4. **개입 최소화:** 대화 맥락상 유저가 나설 상황이 아니라면 억지로 질문하거나 시선을 주지 마라. 상황에 맞춰 자연스럽게 융화되어라.
5. **언어 제한:** 한자나 일본어 사용 금지. 자연스러운 한국어만 사용.`;

    if (isAuto) {
      systemPrompt += `\n\n[특수: 자동 진행 모드 (혼잣말/단독 행동)]
- 현재 유저("${settings.myName}")의 입력이 없다. 절대 유저의 대사나 행동을 네가 대신 작성하지 마라.
- 오직 AI 캐릭터("${settings.charName}") 혼자만의 내면 생각, 혼잣말, 단독 행동, 주변 묘사만을 활용해 자연스럽게 스토리를 이끌어가라.`;
    }

    const history = messages.slice(-200).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    
    // 🌟 [핵심 픽스] 공백 전송 시 AI가 유저의 대답을 강제로 만들어내는 버그를 잡기 위해,
    // isAuto 일 때는 'User:' 태그를 아예 삭제하고 시스템 메시지로 대체합니다.
    const combinedPrompt = isAuto
      ? `${systemPrompt}\n\n[기록]\n${history}\n\n[시스템: 유저의 개입 없이 시간이 흐름. 캐릭터 단독 진행]\nAI:`
      : `${systemPrompt}\n\n[기록]\n${history}\n\nUser: ${content}\n\nAI:`;

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
          setIsLoading(false);
          toast.error("통신 중 오류가 발생했습니다.");
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

  /** 🚀 2. 조연 소환 핸들러 (투스텝 난입 시스템) */
  const handleSummonCharacter = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    const toastId = toast.loading("조연이 개입할 타이밍을 엿보는 중...", { id: "summon" });

    // 1단계: 조연 캐릭터의 대사만 따로 짧게 생성합니다.
    const systemPrompt = `너는 현재 설정된 조연 캐릭터 중 한 명이다. 
조연 정보: ${JSON.stringify(settings.supportingCharacters)}
현재 대화 맥락을 읽고, 조연 중 한 명이 대화에 불쑥 끼어드는 상황을 가정하여 1~2문장의 대사를 작성하라.
유저("${settings.myName}")나 메인 캐릭터("${settings.charName}")의 행동은 절대 묘사하지 마라.
출력 형식: **[조연 이름]** "대사 내용"
만약 설정된 조연이 없다면 맥락에 맞는 엑스트라를 임의로 창작하라.`;

    const history = messages.slice(-20).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const prompt = `${systemPrompt}\n\n[기록]\n${history}\n\n조연의 대사:`;

    let extraLine = "";
    try {
      await streamChat({
        message: prompt,
        onDelta: (delta) => { extraLine += delta; },
        onDone: () => {
          toast.dismiss(toastId);
          setIsLoading(false); 
          if (extraLine.trim()) {
            // 2단계: 생성된 조연의 대사를 내(User)가 보낸 것처럼 handleSend에 넘깁니다.
            // 이렇게 하면 오른쪽에 조연의 대사가 찍히고, AI(메인)가 그 조연의 말에 반응하게 됩니다.
            handleSend(extraLine.trim());
          }
        },
        onError: (err) => {
          toast.dismiss(toastId);
          setIsLoading(false);
          toast.error("조연 소환 중 오류가 발생했습니다.");
        }
      });
    } catch(e) {
      toast.dismiss(toastId);
      setIsLoading(false);
    }
  }, [isLoading, messages, settings, handleSend]);

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
          <button onClick={handleGenerateImage} disabled={isLoading} title="이미지 생성" className="p-2 hover:text-primary transition-colors disabled:opacity-40">
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

      {contextMenu && (
        <div 
          className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" 
          style={{ left: contextMenu.x, top: contextMenu.y }} 
          onClick={() => setContextMenu(null)}
        >
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" 
            onClick={() => { 
              const m = messages.find(m => m.id === contextMenu.id); 
              if(m){ setEditingId(m.id); setEditValue(m.content); } 
            }}>
            <Edit3 size={14} /> 메시지 수정
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={() => { deleteMessage(contextMenu.id); toast.success("삭제되었습니다"); }}>
            <X size={14} /> 삭제
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors" onClick={() => { deleteMessagesFrom(contextMenu.id); toast.success("이후 대화가 삭제되었습니다"); }}>
            <Scissors size={14} /> 이후 삭제
          </button>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl p-4 space-y-4 shadow-2xl border border-border">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Edit3 size={16} /> 메시지 수정
            </h3>
            <textarea 
              value={editValue} 
              onChange={(e) => setEditValue(e.target.value)} 
              className="w-full h-40 bg-muted rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" 
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors">
                취소
              </button>
              <button onClick={() => { editMessage(editingId, editValue); setEditingId(null); toast.success("성공적으로 수정되었습니다."); }} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg active:scale-95 transition-all shadow-md">
                저장
              </button>
            </div>
          </div>
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
          <button onClick={handleNarration} disabled={isLoading} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:scale-90 transition-all disabled:opacity-40" title="나레이션 (*)">
            <Star size={18} />
          </button>
          <button onClick={handleSummonCharacter} disabled={isLoading} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:scale-90 transition-all disabled:opacity-40" title="조연 난입">
            <Users size={18} />
          </button>
          <button onClick={() => handleSend(input.trim() === "" ? "[AUTO]" : undefined)} disabled={isLoading} className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md disabled:opacity-40">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;