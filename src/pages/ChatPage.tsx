아이고, 정말 죄송합니다! 빌드 에러의 원인은 제가 드린 답변의 설명 텍스트(네, 제가 코드를...)까지 코드 파일 안에 같이 복사되어 들어갔기 때문입니다.

Vite 빌드 도구가 한글 설명을 코드로 착각해서 "왜 코드 첫 줄에 한글이 있느냐"라고 에러를 낸 상황입니다. 설명 텍스트를 모두 제외하고, 오직 순수하게 코드만 담아서 다시 드립니다.

src/pages/ChatPage.tsx 파일을 여시고 안에 있는 내용을 전부 지운 뒤, 아래 코드박스의 내용만 처음부터 끝까지 그대로 복사해서 붙여넣어 주세요.

🛠️ src/pages/ChatPage.tsx (순수 코드 최종본)
TypeScript
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

  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [contextMenu]);

  useEffect(() => {
    const handleExit = () => { if (msgRef.current.length > 0) autoSaveConversation(msgRef.current, setRef.current); };
    window.addEventListener("beforeunload", handleExit);
    return () => { window.removeEventListener("beforeunload", handleExit); handleExit(); };
  }, [autoSaveConversation]);

  const getDefaultSaveTitle = useCallback(() => (settings.charName || "새 대화").trim().slice(0, 30), [settings.charName]);

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

    let systemPrompt = `너는 "${settings.charName}"를 연기하는 숙련된 역할극 작가이다.
성격: ${settings.charPersona}, 세계관: ${settings.worldSetting}, 유저(나): ${settings.myName}

[응답 규칙]
1. 모든 행동과 환경 묘사는 반드시 별표(*)로 감싸라.
2. 캐릭터의 대사는 반드시 따옴표("")를 사용하라.
3. 답변 길이: 모바일 가독성을 위해 **핵심 장면 위주로 아주 간결하게 1~2문단 정도**로만 답변하라. (기존보다 절반 분량)
4. 나레이션 텍스트는 유저와 구분되도록 별표 처리를 철저히 하라.`;

    if (isAuto) {
      systemPrompt += `\n[특수 지침: 자동 진행] 유저(나)의 입력이 없으므로, 이전 맥락을 참고하여 유저 캐릭터("${settings.myName}")가 할 법한 행동과 대사를 네가 대신 작성하여 이야기를 이어가라. 유저의 행동 이후에 반응하는 "${settings.charName}"의 모습까지 한꺼번에 짧고 간결하게 한 블록에 담아라.`;
    } else if (isSummon) {
      systemPrompt += `\n[특수 지침: 엑스트라 소환] 현재 상황에 어울리는 새로운 조연(엑스트라)을 반드시 등장시켜라. 이름은 맥락에 맞게 네가 정하고, 그 인물의 입장에서 짧게 대화와 행동을 묘사하라.`;
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
    
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*") && msg.content.length > 2;
    if (isNarration) {
      return <span className="italic text-muted-foreground/80">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
  };

  const backgroundStyle = settings.chatBackground ? {
    backgroundImage: `url(${settings.chatBackground})`,
    backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" as const
  } : {};

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold overflow-hidden">
            {settings.charAvatar ? (
              <img src={settings.charAvatar} className="w-full h-full object-cover" alt="avatar" />
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
                 <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground font-bold mr-2 mt-1 shrink-0">
                   {settings.charAvatar ? <img src={settings.charAvatar} className="w-full h-full rounded-full object-cover" alt="avatar" /> : charName[0]}
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