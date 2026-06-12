import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Send, Settings, Trash2, Loader2, X, Scissors, Save, List, Star, ImageIcon, Users, Edit3, UserPlus, BookOpen, Search, AlignLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import { generateImage, encodeImageMessage, decodeImageMessage } from "@/lib/image-api";
import ImageCard from "@/components/ImageCard";

const SPLIT_MARKER = "[[SPLIT]]";

// 🌟 Zeta 스타일: 문장을 분석해서 나레이션과 대사 블록으로 쪼개는 함수
const parseMessageIntoBlocks = (msg: any, defaultCharName: string) => {
  if (msg.role === "user") {
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*");
    return [{
      id: msg.id,
      type: isNarration ? 'narration' : 'user',
      name: 'User',
      text: isNarration ? msg.content.slice(1, -1) : msg.content
    }];
  }

  const blocks: any[] = [];
  // 줄바꿈 단위로 문단을 나눕니다.
  const paragraphs = msg.content.split(/\n{1,}/).filter((p: string) => p.trim());

  paragraphs.forEach((p: string, idx: number) => {
    // **[캐릭터명]** 형태인지 검사
    const match = p.match(/^\*\*\[(.*?)\]\*\*\s*(.*)/);
    if (match) {
      blocks.push({ id: `${msg.id}-${idx}`, type: 'speech', name: match[1].trim(), text: match[2].trim() });
    } else {
      // 1. 전체가 *로 감싸여 있고 따옴표가 없으면 100% 행동/나레이션
      const isActionOnly = p.trim().startsWith("*") && p.trim().endsWith("*") && !p.includes('"');
      
      if (isActionOnly) {
        blocks.push({ id: `${msg.id}-${idx}`, type: 'narration', name: '', text: p.replace(/\*/g, '').trim() });
      } else if (p.includes('"') || p.includes('“') || p.includes('”')) {
        // 따옴표가 있으면 누군가 말하는 중이라고 판단 (기본 메인 캐릭터)
        blocks.push({ id: `${msg.id}-${idx}`, type: 'speech', name: defaultCharName, text: p.trim() });
      } else {
        // 따옴표도 없고 캐릭터명도 없으면 배경 묘사(나레이션)로 간주 (Zeta 스타일)
        blocks.push({ id: `${msg.id}-${idx}`, type: 'narration', name: '', text: p.replace(/\*/g, '').trim() });
      }
    }
  });
  return blocks;
};

// 🌟 행동(*...*)과 대사를 구분하여 색상을 다르게 칠해주는 함수
const renderRichText = (text: string) => {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return <span key={i} className="italic text-muted-foreground/80">{part.slice(1, -1)}</span>;
    }
    return (
      <span key={i}>
        {part.split('\n').map((line, j, arr) => (
          <React.Fragment key={j}>
            {line}
            {j < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    );
  });
};

const ChatMessageItem = React.memo(({ msg, settings, onContextMenu }: any) => {
  const imgData = decodeImageMessage(msg.content);
  if (imgData) {
    return (
      <div className="flex justify-start relative z-10 mb-4" onContextMenu={(e) => onContextMenu(e, msg.id)}>
        <ImageCard url={imgData.url} prompt={imgData.prompt} />
      </div>
    );
  }

  // 🌟 Zeta 스타일: 하나의 메시지를 여러 개의 블록(나레이션/말풍선)으로 쪼개서 렌더링
  const blocks = parseMessageIntoBlocks(msg, settings.charName);

  return (
    <div className="flex flex-col w-full mb-1 space-y-1" onContextMenu={(e) => onContextMenu(e, msg.id)}>
      {blocks.map((block, idx) => {
        // 1️⃣ 나레이션 블록 렌더링 (Zeta 스타일 투명 배경 + ≡ 아이콘)
        if (block.type === 'narration') {
          return (
            <div key={block.id} className="flex justify-start px-2 py-2 w-full relative z-10">
              <div className="mr-3 mt-[3px] text-muted-foreground/50 shrink-0">
                <AlignLeft size={16} />
              </div>
              <div className="flex-1 text-muted-foreground/90 italic leading-relaxed text-[15px]">
                {block.text}
              </div>
            </div>
          );
        }

        // 2️⃣ 유저 렌더링
        if (block.type === 'user') {
          return (
            <div key={block.id} className="flex justify-end relative z-10 my-2">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm bg-primary text-primary-foreground rounded-br-none">
                {block.text}
              </div>
            </div>
          );
        }

        // 3️⃣ 캐릭터 대사(말풍선) 렌더링
        let avatarUrl = "";
        if (block.name === settings.charName) avatarUrl = settings.charAvatar;
        else {
          const extra = settings.supportingCharacters?.find((c: any) => c.name === block.name);
          if (extra) avatarUrl = extra.avatar;
        }

        return (
          <div key={block.id} className="flex justify-start relative z-10 my-2">
            <div className="mr-3 shrink-0 flex flex-col items-center mt-1">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold overflow-hidden shadow-sm ring-1 ring-border/50">
                {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" /> : block.name[0]}
              </div>
            </div>
            <div className="flex flex-col items-start max-w-[85%]">
              <span className="text-[13px] text-muted-foreground mb-1 ml-1 font-medium">{block.name}</span>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] leading-relaxed shadow-sm text-foreground">
                {renderRichText(block.text)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const ChatPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const { 
    settings, 
    setSettings: updateSettings, 
    addSupportingCharacter = async () => {}, 
    updateSupportingCharacter = async () => {} 
  } = useSettings();
  
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

  const [activeUser, setActiveUser] = useState(true);
  const [activeMain, setActiveMain] = useState(true);
  const [memoryModal, setMemoryModal] = useState<{ id: string | "MAIN", name: string, memory: string } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedNPCs, setExtractedNPCs] = useState<{name: string, persona: string}[]>([]);

  const [activeExtras, setActiveExtras] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("active-extras") || "[]"); }
    catch { return []; }
  });
  const [showParticipantModal, setShowParticipantModal] = useState(false);

  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const autoSaveRef = useRef(autoSaveConversation);

  useEffect(() => {
    localStorage.setItem("active-extras", JSON.stringify(activeExtras));
  }, [activeExtras]);

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
    const handleAutoSave = () => {
      if (messagesRef.current.length > 0) {
        autoSaveRef.current(messagesRef.current, settingsRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleAutoSave();
      }
    };

    window.addEventListener("beforeunload", handleAutoSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      window.removeEventListener("beforeunload", handleAutoSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      handleAutoSave(); 
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

    const participatingExtras = settings.supportingCharacters.filter(c => activeExtras.includes(c.id));
    
    // 🌟 Zeta 스타일을 위한 강력한 포맷팅 규칙 적용
    let systemPrompt = `너는 역할극 작가이다. \n세계관: ${settings.worldSetting}\n\n`;
    
    const participants = [];
    if (activeUser) {
      participants.push(`- 유저(이름: ${settings.myName || "유저"}, 소개: ${settings.myIntro || "없음"})`);
    }
    if (activeMain) {
      participants.push(`- 주연(${settings.charName} - 성격: ${settings.charPersona} / 유저에 대한 기억: ${settings.note || '아직 모름'})`);
    }
    
    participatingExtras.forEach(e => {
      participants.push(`- 조연(${e.name} - 성격: ${e.persona} / 유저에 대한 기억: ${e.personal_memory || '아직 모름'})`);
    });

    systemPrompt += `[현재 대화 참여자 목록]\n${participants.join("\n")}\n\n`;

    systemPrompt += `[역할극 출력 형식 (매우 중요!)]
1. 강제 규칙: ${settings.chatRule || "각 캐릭터의 성격과 '유저에 대한 기억'에 맞게 적절히 대답하라."}
2. 대사/행동 묘사: 캐릭터가 말하거나 행동할 때는 반드시 줄을 바꾸고 **[캐릭터명]** 으로 시작하라. (예: **[레나]** *조심스레 일어서며* "고기 좋아해요.")
3. 나레이션 분리: 누구의 것도 아닌 배경 묘사나 상황 설명은 절대 캐릭터명을 적지 말고, 줄을 바꾸어 작성하라.
4. 단체 대화: 대화 참여자들끼리 각자의 성격에 맞게 반응하며 티키타카를 하라. 목록에 없는 캐릭터는 등장 금지.
5. 언어: 한자/일본어 사용 금지. 한국어만 사용.`;

    if (isAuto) {
      systemPrompt += `\n\n[특수: 자동 진행 모드] 현재 유저의 입력이 없다. 절대 유저의 대사를 네가 대신 작성하지 마라. 현재 참여중인 캐릭터들끼리의 내면 생각, 혼잣말, 단독 행동으로 스토리를 진행하라.`;
    } else if (isSummon) {
      systemPrompt += `\n\n[특수: 엑스트라 난입] 현재 맥락에 맞는 엑스트라나 대화에 참여하지 않던 조연을 1명 난입시켜 짧고 강렬한 대사를 치게 하라.`;
    }

    const memoryCount = settings.selectedModel.includes("gpt") ? -10 : -40;
    const history = messages.slice(memoryCount).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    
    const combinedPrompt = isAuto
      ? `${systemPrompt}\n\n[기록]\n${history}\n\n[시스템: 유저의 개입 없이 시간이 흐름]\nAI:`
      : `${systemPrompt}\n\n[기록]\n${history}\n\nUser: ${content}\n\nAI:`;

    let fullContent = "";
    let assistantStarted = false;

    try {
      await streamChat({
        message: combinedPrompt,
        settings: settings, 
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
          toast.error(typeof err === 'string' ? err : "통신 중 오류가 발생했습니다.");
        }
      });
    } catch (error: any) { 
      setIsLoading(false); 
      toast.error(error.message || "오류가 발생했습니다."); 
    }
  }, [input, isLoading, messages, settings, addMessage, updateLastAssistant, activeExtras, activeUser, activeMain]);

  const handleNarration = useCallback(() => {
    if (isLoading) return;
    const trimmed = input.trim();
    if (trimmed) {
      addMessage({ role: "user", content: `*${trimmed}*` });
      setInput("");
    } else {
      setInput("*");
    }
  }, [input, isLoading, addMessage]);

  const handleSummonCharacter = useCallback(async () => {
    if (isLoading) return;
    const targetCharacter = input.trim();
    if (targetCharacter) setInput(""); 

    setIsLoading(true);
    const toastId = toast.loading(
      targetCharacter ? `"${targetCharacter}" 등장 준비 중...` : "새 인물이 개입할 타이밍 엿보는 중...", 
      { id: "summon" }
    );

    let systemPrompt = `너는 현재 설정된 캐릭터 중 한 명이다. 조연 정보: ${JSON.stringify(settings.supportingCharacters)}`;

    if (targetCharacter) {
      systemPrompt += `반드시 "${targetCharacter}"(이)라는 인물이 대화에 불쑥 끼어드는 상황을 가정하여 1~2문장의 대사를 작성하라.`;
    } else {
      systemPrompt += `현재 대화 맥락을 읽고, 누군가 대화에 불쑥 끼어드는 상황을 가정하여 1~2문장의 대사를 작성하라.`;
    }

    systemPrompt += `\n출력 형식: **[${targetCharacter || "등장인물 이름"}]** "대사 내용"`;

    const memoryCount = settings.selectedModel.includes("gpt") ? -8 : -20;
    const history = messages.slice(memoryCount).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    
    const prompt = `${systemPrompt}\n\n[기록]\n${history}\n\n조연의 대사:`;

    let extraLine = "";
    try {
      await streamChat({
        message: prompt,
        settings: settings, 
        onDelta: (delta) => { extraLine += delta; },
        onDone: () => {
          toast.dismiss(toastId);
          setIsLoading(false); 
          if (extraLine.trim()) {
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
  }, [input, isLoading, messages, settings, handleSend]);

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

  const handleExtractNPCs = async () => {
    setIsExtracting(true);
    const toastId = toast.loading("최근 대화에서 인물 찾는 중...");
    try {
      const history = messages.slice(-15).map(m => `${m.role}: ${m.content}`).join("\n");
      const api = await import("@/lib/gemini-api").catch(() => null);
      
      if (api && api.extractCharactersFromHistory) {
        const npcs = await api.extractCharactersFromHistory(history, settings.selectedModel, settings.geminiApiKey);
        setExtractedNPCs(npcs);
        if(npcs.length > 0) {
          toast.success(`${npcs.length}명의 캐릭터를 찾았습니다!`, { id: toastId });
        } else {
          toast.info("새로운 캐릭터를 찾지 못했습니다.", { id: toastId });
        }
      } else {
        toast.error("API 함수가 준비되지 않았습니다. (gemini-api.ts 업데이트 필요)", { id: toastId });
      }
    } catch (e) {
      toast.error("조연 추출에 실패했습니다.", { id: toastId });
    } finally {
      setIsExtracting(false);
    }
  };

  const saveMemory = async () => {
    if (!memoryModal) return;
    if (memoryModal.id === "MAIN") {
      await updateSettings({ ...settings, note: memoryModal.memory });
    } else {
      await updateSupportingCharacter(memoryModal.id, { personal_memory: memoryModal.memory });
    }
    toast.success("기억이 성공적으로 저장되었습니다.");
    setMemoryModal(null);
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
        <button onClick={() => navigate("/settings")} className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity overflow-hidden max-w-[50%]">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold overflow-hidden shrink-0">
            {settings.charAvatar ? (
              <img src={settings.charAvatar} className="w-full h-full object-cover" alt="avatar" />
            ) : (settings.charName || "AI")[0]}
          </div>
          <div className="text-left truncate">
            <p className="font-semibold text-sm leading-tight truncate">
              {settings.charName || "AI 캐릭터"} 
            </p>
            <p className="text-[10px] text-muted-foreground">프로필 설정</p>
          </div>
        </button>
        <div className="flex gap-1 text-muted-foreground">
          <button onClick={() => setShowParticipantModal(true)} title="참여자 설정" className="p-2 hover:text-primary transition-colors">
            <UserPlus size={18} />
          </button>
          <button onClick={handleGenerateImage} disabled={isLoading} title="이미지 생성" className="p-2 hover:text-primary transition-colors disabled:opacity-40">
            {isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          </button>
          <button onClick={handleSave} title="저장" className="p-2 hover:text-primary transition-colors">
            <Save size={18} />
          </button>
          <button onClick={() => navigate("/conversations")} title="목록" className="p-2 hover:text-foreground transition-colors">
            <List size={18} />
          </button>
          <button 
            onClick={() => { 
              if(window.confirm("대화를 모두 지울까요?")) {
                clearMessages(); 
                setCurrentConvId(null); 
              }
            }} 
            title="초기화" className="p-2 hover:text-destructive transition-colors">
            <Trash2 size={18} />
          </button>
          <button onClick={() => navigate("/settings")} title="설정" className="p-2 hover:text-foreground transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* 참여자 & 기억 설정 모달 */}
      {showParticipantModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl border border-border flex flex-col max-h-[80vh]">
            <h3 className="text-base font-bold flex items-center gap-2 shrink-0">
              <Users size={18} className="text-primary" /> 참여자 & 기억 설정
            </h3>
            <p className="text-xs text-muted-foreground shrink-0">
              체크된 캐릭터들이 대화에 참여합니다. 책 모양 버튼을 눌러 유저에 대한 기억을 수정하세요.
            </p>
            
            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors border border-border/50">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input type="checkbox" checked={activeUser} onChange={(e) => setActiveUser(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                  <span className="text-sm font-semibold text-primary">👤 {settings.myName || "유저"} (나)</span>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors border border-border/50">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input type="checkbox" checked={activeMain} onChange={(e) => setActiveMain(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                  <span className="text-sm font-semibold">👑 {settings.charName} <span className="text-xs text-muted-foreground font-normal">(주연)</span></span>
                </label>
                <button onClick={() => setMemoryModal({ id: "MAIN", name: settings.charName, memory: settings.note })} className="p-1.5 text-muted-foreground hover:text-primary bg-background rounded-md border border-border shrink-0 ml-2">
                  <BookOpen size={14} />
                </button>
              </div>
              
              {settings.supportingCharacters.map(char => (
                <div key={char.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors border border-border/50">
                  <label className="flex items-center gap-3 cursor-pointer flex-1 overflow-hidden">
                    <input type="checkbox" checked={activeExtras.includes(char.id)} onChange={(e) => {
                        if(e.target.checked) setActiveExtras(prev => [...prev, char.id]);
                        else setActiveExtras(prev => prev.filter(id => id !== char.id));
                      }} className="w-4 h-4 rounded border-border accent-primary" />
                    <div className="flex flex-col truncate">
                      <span className="text-sm font-medium truncate">{char.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{char.persona}</span>
                    </div>
                  </label>
                  <button onClick={() => setMemoryModal({ id: char.id, name: char.name, memory: char.personal_memory || "" })} className="p-1.5 text-muted-foreground hover:text-primary bg-background rounded-md border border-border shrink-0 ml-2">
                    <BookOpen size={14} />
                  </button>
                </div>
              ))}
              
              {settings.supportingCharacters.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  추가된 조연이 없습니다.
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-border pt-4">
              <button onClick={handleExtractNPCs} disabled={isExtracting} className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all border border-border">
                {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 대화에서 조연 자동 찾기
              </button>
              
              {extractedNPCs.length > 0 && (
                <div className="bg-background border border-border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1 mt-2">
                  {extractedNPCs.map((npc, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-1.5 bg-muted rounded">
                      <div className="flex flex-col truncate pr-2">
                        <span className="font-bold truncate">{npc.name}</span>
                      </div>
                      <button onClick={() => { 
                          addSupportingCharacter({ name: npc.name, persona: npc.persona, avatar: "", personal_memory: "" }); 
                          setExtractedNPCs(prev => prev.filter((_, i) => i !== idx));
                          toast.success(`${npc.name} 추가됨!`); 
                        }} className="px-2 py-1 bg-primary text-primary-foreground rounded text-[10px] shrink-0">
                        추가
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-2 shrink-0">
              <button onClick={() => setShowParticipantModal(false)} className="px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl active:scale-95 transition-all">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기억 수정 모달 */}
      {memoryModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl border border-border">
            <h3 className="text-base font-bold flex items-center gap-2">
              <BookOpen size={18} className="text-primary" /> {memoryModal.name}의 기억
            </h3>
            <p className="text-xs text-muted-foreground">이 캐릭터가 유저에 대해 알고 있는 정보를 요약하세요.</p>
            <textarea 
              value={memoryModal.memory} 
              onChange={(e) => setMemoryModal({ ...memoryModal, memory: e.target.value })} 
              className="w-full h-32 bg-muted rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" 
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setMemoryModal(null)} className="px-4 py-2 text-sm hover:bg-muted rounded-lg transition-colors">취소</button>
              <button onClick={saveMemory} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg active:scale-95 transition-all shadow-md">저장</button>
            </div>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4 relative" style={backgroundStyle}>
        {settings.chatBackground && <div className="absolute inset-0 bg-black/20 pointer-events-none z-0" />}
        
        {messages.map((msg) => (
          <ChatMessageItem 
            key={msg.id}
            msg={msg}
            settings={settings}
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
        <div className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => setContextMenu(null)}>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" 
            onClick={() => { 
              const m = messages.find(m => m.id === contextMenu.id); 
              if(m){ setEditingId(m.id); setEditValue(m.content); } 
            }}>
            <Edit3 size={14} /> 메시지 원본 수정
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
              <Edit3 size={16} /> 메시지 원본 수정
            </h3>
            <textarea 
              value={editValue} 
              onChange={(e) => setEditValue(e.target.value)} 
              className="w-full h-40 bg-muted rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" 
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors">취소</button>
              <button onClick={() => { editMessage(editingId, editValue); setEditingId(null); toast.success("성공적으로 수정되었습니다."); }} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg active:scale-95 transition-all shadow-md">저장</button>
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
          <button onClick={handleNarration} disabled={isLoading} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground active:scale-90 transition-all disabled:opacity-40" title="나레이션 추가 (AI 대기)">
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