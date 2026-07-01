/**
 * ChatPage.tsx
 * 상세 구현 코드: 786줄 이상 준수
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Send, Settings, Trash2, Loader2, X, Scissors, Save, List, 
  Star, ImageIcon, Users, Edit3, UserPlus, BookOpen, Search, AlignLeft 
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useSettings, useMessages, useConversations } from "@/lib/store";
import { streamChat } from "@/lib/chat-api";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import { generateImage, encodeImageMessage, decodeImageMessage } from "@/lib/image-api";
import ImageCard from "@/components/ImageCard";

const SPLIT_MARKER = "[[SPLIT]]";

// ✅ 모듈 스코프로 이동 — 리렌더링/언마운트와 완전히 무관하게 유지됨
const _npcQueue: { name: string; persona: string }[] = [];
let _npcIndex = 0;

/**
 * 메시지 블록 파싱 함수
 * ✅ 나레이션이 중간에 껴있어도 가장 마지막에 말한 캐릭터를 찾아내어 화자 꼬임 방지
 */
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
  const paragraphs = msg.content.split(/\n{1,}/).filter((p: string) => p.trim());

  paragraphs.forEach((p: string, idx: number) => {
    // 1. [캐릭터명] 대사 형식 처리
    const match = p.match(/^\*\*\[(.*?)\]\*\*\s*(.*)/);
    if (match) {
      const charName = match[1].trim();
      const textContent = match[2].trim();
      
      if (charName === "시스템" || charName.toUpperCase() === "SYSTEM") {
        blocks.push({ id: `${msg.id}-${idx}`, type: 'narration', name: '', text: textContent });
      } else {
        blocks.push({ id: `${msg.id}-${idx}`, type: 'speech', name: charName, text: textContent });
      }
      return;
    }

    // 2. 시스템: 내용 형식 처리
    const sysMatch = p.match(/^(시스템|System)\s*:\s*(.*)/i);
    if (sysMatch) {
      blocks.push({ id: `${msg.id}-${idx}`, type: 'narration', name: '', text: sysMatch[2].trim() });
      return;
    }

    // 3. 행동 묘사만 있는 경우 (*...* 또는 (...))
    const isActionOnly = p.trim().startsWith("*") && p.trim().endsWith("*") && !p.includes('"') && !p.includes('\u201c');
    const isParenActionOnly = p.trim().startsWith("(") && p.trim().endsWith(")") && !p.includes('"') && !p.includes('\u201c');
    
    if (isActionOnly || isParenActionOnly) {
      let cleanText = p.trim();
      if (isActionOnly) cleanText = cleanText.replace(/\*/g, '');
      blocks.push({ id: `${msg.id}-${idx}`, type: 'narration', name: '', text: cleanText });
      return;
    } 
    
    // 4. 그냥 대사만 있는 경우 (따옴표 포함)
    // ✅ 이전 블록이 나레이션이더라도, 배열을 거꾸로 뒤져서 가장 최근에 말한 '화자'를 찾아냄
    if (p.includes('"') || p.includes('\u201c') || p.includes('\u201d')) {
      let assumedName = defaultCharName;
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].type === 'speech') {
          assumedName = blocks[i].name;
          break;
        }
      }
      blocks.push({ id: `${msg.id}-${idx}`, type: 'speech', name: assumedName, text: p.trim() });
    } else {
      blocks.push({ id: `${msg.id}-${idx}`, type: 'narration', name: '', text: p.replace(/\*/g, '').trim() });
    }
  });
  return blocks;
};

/**
 * 리치 텍스트 렌더링 함수
 */
const renderRichText = (text: string) => {
  const parts = text.split(/(\*[^*]+\*|\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return <span key={i} className="italic text-muted-foreground/80">{part.slice(1, -1)}</span>;
    } else if (part.startsWith("(") && part.endsWith(")")) {
      return <span key={i} className="italic text-muted-foreground/80">{part}</span>;
    }
    
    return (
      <span key={i} className="text-foreground">
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

/**
 * 채팅 메시지 컴포넌트
 */
const ChatMessageItem = React.memo(({ msg, settings, onContextMenu }: any) => {
  const imgData = decodeImageMessage(msg.content);
  if (imgData) {
    return (
      <div className="flex justify-start relative z-10 mb-4" onContextMenu={(e) => onContextMenu(e, msg.id, null)}>
        <ImageCard url={imgData.url} prompt={imgData.prompt} />
      </div>
    );
  }

  const blocks = parseMessageIntoBlocks(msg, settings.charName);

  return (
    <div className="flex flex-col w-full mb-1 space-y-1">
      {blocks.map((block, idx) => {
        if (block.type === 'narration') {
          return (
            <div key={block.id} className="flex justify-start w-full relative z-10 my-1" onContextMenu={(e) => onContextMenu(e, msg.id, idx)}>
              <div className="mr-3 mt-1.5 text-muted-foreground/50 shrink-0">
                <AlignLeft size={16} />
              </div>
              <div className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-muted-foreground italic leading-relaxed text-[15px] shadow-sm">
                {block.text}
              </div>
            </div>
          );
        }

        if (block.type === 'user') {
          return (
            <div key={block.id} className="flex justify-end relative z-10 my-2" onContextMenu={(e) => onContextMenu(e, msg.id, idx)}>
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm bg-primary text-primary-foreground rounded-br-none">
                {block.text}
              </div>
            </div>
          );
        }

        let avatarUrl = "";
        if (block.name === settings.charName) avatarUrl = settings.charAvatar;
        else {
          const extra = settings.supportingCharacters?.find((c: any) => c.name === block.name);
          if (extra) avatarUrl = extra.avatar;
        }

        return (
          <div key={block.id} className="flex justify-start relative z-10 my-2" onContextMenu={(e) => onContextMenu(e, msg.id, idx)}>
            <div className="mr-3 shrink-0 flex flex-col items-center mt-1">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold overflow-hidden shadow-sm ring-1 ring-border/50">
                {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" /> : block.name[0]}
              </div>
            </div>
            <div className="flex flex-col items-start max-w-[85%]">
              <span className="text-[13px] text-muted-foreground mb-1 ml-1 font-medium">{block.name}</span>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] leading-relaxed shadow-sm">
                {renderRichText(block.text)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

/**
 * 메인 컴포넌트: ChatPage
 */
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
  
  // --- 상태값 ---
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; blockIndex: number | null; x: number; y: number } | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeUser, setActiveUser] = useState(true);
  const [activeMain, setActiveMain] = useState(true);
  const [memoryModal, setMemoryModal] = useState<{ id: string | "MAIN", name: string, memory: string } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  
  // 🌟 새롭게 추가된 상태: 대화 기록 정리 중 여부
  const [isExtractingMemory, setIsExtractingMemory] = useState(false);

  const [activeExtras, setActiveExtras] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("active-extras") || "[]"); }
    catch { return []; }
  });
  const [showParticipantModal, setShowParticipantModal] = useState(false);

  // --- Ref ---
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const autoSaveRef = useRef(autoSaveConversation);

  // --- Effects ---
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

  // --- Handlers ---
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
    
    const excludedNames = [];
    if (!activeUser) excludedNames.push(settings.myName || "유저");
    if (!activeMain) excludedNames.push(settings.charName);
    settings.supportingCharacters.forEach(c => {
      if (!activeExtras.includes(c.id)) excludedNames.push(c.name);
    });

    let systemPrompt = `너는 역할극 작가이다. \n세계관: ${settings.worldSetting}\n\n`;
    
    const participants = [];
    if (activeUser) participants.push(`- 유저(이름: ${settings.myName || "유저"}, 소개: ${settings.myIntro || "없음"})`);
    if (activeMain) participants.push(`- 주연(${settings.charName} - 성격: ${settings.charPersona} / 유저에 대한 기억: ${settings.note || '아직 모름'})`);
    participatingExtras.forEach(e => {
      participants.push(`- 조연(${e.name} - 성격: ${e.persona} / 유저에 대한 기억: ${e.personal_memory || '아직 모름'})`);
    });

    systemPrompt += `[현재 대화 참여자 목록]\n${participants.join("\n")}\n\n`;
    if (excludedNames.length > 0) {
      systemPrompt += `[🛑 절대 금지 규칙: 다음 캐릭터들은 현재 자리에 없거나 대화에서 빠졌으므로, 절대로 등장시키거나 대사를 작성하지 마라: ${excludedNames.join(", ")}]\n\n`;
    }

    systemPrompt += `[역할극 출력 형식 및 길이 제어 (매우 중요!)]
1. 강제 규칙: 각 캐릭터의 성격에 맞게 대답하라.
2. 🌟 길이 및 구조 제어 (반드시 아래의 박스 갯수와 글자 수를 준수할 것):
   - 나레이션(상황 묘사/배경 설명): 한 번의 답변에서 약 ${settings.narrationCount || 3}개의 문단(박스)으로 나누어 출력하고, 각 문단은 대략 ${settings.narrationLength || 50}자 내외로 작성하라.
   - 주연(${settings.charName}) 대사: 한 번의 답변에서 약 ${settings.mainCharCount || 2}개의 말풍선(박스)으로 나누어 출력하고, 각 대사는 대략 ${settings.mainCharLength || 30}자 내외로 작성하라.
   - 조연 대사: 한 번의 답변에서 조연이 나설 경우 약 ${settings.extraCharCount || 2}개의 말풍선(박스)으로 나누어 출력하고, 각 대사는 대략 ${settings.extraCharLength || 30}자 내외로 작성하라.
   (현재 설정된 추가 노트/기억 내용: ${settings.note || '없음'})
3. 대화 블록 분리: **모든 대사 앞에는 반드시 화자의 이름을 명시해야 한다.** 절대 화자 이름 없이 따옴표만 출력하지 마라. (형식: **[캐릭터명]** "대사 내용")
4. 대사/행동 분리: 대사 중간이나 앞뒤의 행동/감정 묘사는 별표(*) 또는 괄호()로 감싸라. (예: **[레나]** (조심스레 일어서며) "고기 좋아해요.")
5. 나레이션 분리: 누구의 대사도 아닌 순수 배경 묘사, 상황 설명, 시간 경과 등은 캐릭터명이나 따옴표 없이 줄을 바꾸어 작성하라. (만약 시스템 메시지라면 **[시스템]** 이라고 표기하라)
6. 언어: 한자/일본어 사용 금지. 한국어만 사용.`;

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
    console.log("▶ 클릭됨. _npcQueue.length =", _npcQueue.length, "_npcIndex =", _npcIndex);
    setIsExtracting(true);
    const toastId = toast.loading("조연 찾는 중...");

    console.log("[NPC] 호출됨 — 현재 큐 길이:", _npcQueue.length, "/ 인덱스:", _npcIndex);

    try {
      if (_npcQueue.length === 0) {
        const history = messages.slice(-15).map(m => `${m.role}: ${m.content}`).join("\n");
        const api = await import("@/lib/gemini-api");
        const npcs = await api.extractCharactersFromHistory(history, settings.selectedModel, settings.geminiApiKey);

        if (!npcs || npcs.length === 0) {
          toast.info("추출된 조연이 없습니다.", { id: toastId });
          setIsExtracting(false);
          return;
        }

        _npcQueue.length = 0;
        _npcQueue.push(...npcs);
        _npcIndex = 0;
        console.log("[NPC] 새로 추출됨:", _npcQueue.map(n => n.name));
      }

      const target = _npcQueue[_npcIndex];
      console.log("[NPC] 추가할 캐릭터:", target.name, `(${_npcIndex + 1}/${_npcQueue.length})`);

      addSupportingCharacter({
        name: target.name,
        persona: target.persona,
        avatar: "",
        personal_memory: ""
      });

      toast.success(`[${target.name}] 추가됨 (순번: ${_npcIndex + 1}/${_npcQueue.length})`, { id: toastId });

      _npcIndex = (_npcIndex + 1) % _npcQueue.length;
      console.log("[NPC] 다음 인덱스:", _npcIndex);

    } catch (e: any) {
      console.error(e);
      toast.error(`추출 실패: ${e.message}`, { id: toastId });
    } finally {
      setIsExtracting(false);
    }
  };

  // 🌟 새롭게 추가된 기능: 대화 기록을 분석하여 '영구적인 중대 설정'만 뽑아내어 노트에 누적 저장
  const handleExtractMemory = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("정리할 대화 기록이 없습니다.");
      return;
    }

    setIsExtractingMemory(true);
    const toastId = toast.loading("대화에서 중요한 영구 설정을 분석 중입니다...");

    // 너무 길면 컨텍스트가 넘치므로 최근 30개 메시지 위주로 분석
    const history = messages.slice(-30).map(m => `${m.role === "assistant" ? settings.charName : (settings.myName || "유저")}: ${m.content}`).join("\n");
    
    const systemPrompt = `너는 역할극 대화 기록을 분석하여 '핵심 설정'을 기록하는 전문 서기다.
유저와 캐릭터 간의 대화를 읽고, **영구적이고 중대한 변화나 설정(낙인처럼 새겨야 할 내용)**만 추출하라.
- 포함할 예시: 신체 훼손(예: 팔이 잘림), 영구적인 외모 변화(염색, 흉터), 돌이킬 수 없는 중대한 사건, 아주 중요한 특수 아이템 획득.
- 제외할 예시: "내일 만나자", "밥 먹자" 같은 일회성 약속, 사소한 감정 변화, 일상적인 대화.

[현재 캐릭터의 기존 노트(기억) 내용]
${settings.note || "없음"}

위 대화 기록을 분석하여, '기존 노트'에 없는 **새로운 중대 설정**만 요약하라.
기존 노트 내용 뒤에 자연스럽게 덧붙일 수 있도록 요약된 문장들만 작성하라.
만약 새롭게 추가할 중대한 설정이 하나도 없다면, 반드시 "추가할 내용 없음" 이라고만 대답하라.`;

    const prompt = `${systemPrompt}\n\n[최근 대화 기록]\n${history}\n\n새로운 기억 요약:`;

    let extraLine = "";
    try {
      await streamChat({
        message: prompt,
        settings: settings,
        onDelta: (delta) => { extraLine += delta; },
        onDone: async () => {
          toast.dismiss(toastId);
          setIsExtractingMemory(false);
          const result = extraLine.trim();
          
          if (result === "" || result.includes("추가할 내용 없음")) {
            toast.info("새로 기억할 만한 중대한 설정 변화가 없습니다.");
          } else {
            // 기존 노트 뒤에 새로운 기억을 줄바꿈하여 덧붙임
            const newNote = settings.note ? `${settings.note}\n${result}` : result;
            await updateSettings({ ...settings, note: newNote });
            toast.success("중요한 대화 설정이 주연의 기억(노트)에 영구적으로 새겨졌습니다!");
          }
        },
        onError: (err) => {
          toast.dismiss(toastId);
          setIsExtractingMemory(false);
          toast.error("대화 내용 분석 중 오류가 발생했습니다.");
        }
      });
    } catch (e) {
      toast.dismiss(toastId);
      setIsExtractingMemory(false);
    }
  }, [messages, settings, updateSettings]);

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

  const handleDeleteBlock = () => {
    if (!contextMenu) return;
    
    const { id, blockIndex } = contextMenu;
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    if (blockIndex === null) {
      deleteMessage(id);
      toast.success("삭제되었습니다");
    } else {
      const paragraphs = msg.content.split(/\n{1,}/).filter(p => p.trim());
      if (paragraphs.length <= 1) {
        deleteMessage(id);
      } else {
        paragraphs.splice(blockIndex, 1);
        const newContent = paragraphs.join("\n\n");
        editMessage(id, newContent);
      }
      toast.success("해당 말풍선이 삭제되었습니다");
    }
    setContextMenu(null);
  };

  const handleDeleteFromHere = () => {
    if (!contextMenu) return;
    const { id, blockIndex } = contextMenu;
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return;

    if (msgIndex + 1 < messages.length) {
       deleteMessagesFrom(messages[msgIndex + 1].id);
    }

    if (blockIndex !== null && blockIndex > 0) {
      const msg = messages[msgIndex];
      const paragraphs = msg.content.split(/\n{1,}/).filter(p => p.trim());
      const keptParagraphs = paragraphs.slice(0, blockIndex);
      editMessage(id, keptParagraphs.join("\n\n"));
    } else {
      deleteMessage(id);
    }

    toast.success("선택한 말풍선 이후의 대화가 모두 삭제되었습니다.");
    setContextMenu(null);
  };

  const handleEditBlockStart = () => {
    if (!contextMenu) return;
    const { id, blockIndex } = contextMenu;
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    if (blockIndex === null) {
      setEditingId(id);
      setEditingBlockIndex(null);
      setEditValue(msg.content);
    } else {
      const paragraphs = msg.content.split(/\n{1,}/).filter(p => p.trim());
      setEditingId(id);
      setEditingBlockIndex(blockIndex);
      setEditValue(paragraphs[blockIndex] || "");
    }
    setContextMenu(null);
  };

  const handleEditSave = () => {
    if (!editingId) return;
    const msg = messages.find(m => m.id === editingId);
    if (!msg) return;

    if (editingBlockIndex === null) {
      editMessage(editingId, editValue);
    } else {
      const paragraphs = msg.content.split(/\n{1,}/).filter(p => p.trim());
      paragraphs[editingBlockIndex] = editValue;
      editMessage(editingId, paragraphs.join("\n\n"));
    }
    setEditingId(null);
    setEditingBlockIndex(null);
    toast.success("성공적으로 수정되었습니다.");
  };

  const backgroundStyle = settings.chatBackground ? {
    backgroundImage: `url(${settings.chatBackground})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed" as const
  } : {};

  // --------------------------------------------------------------------------
  // [렌더링]
  // --------------------------------------------------------------------------
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

      {/* 모달: 참여자 & 기억 설정 */}
      {showParticipantModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl border border-border flex flex-col max-h-[80vh]">
            <h3 className="text-base font-bold flex items-center gap-2 shrink-0">
              <Users size={18} className="text-primary" /> 참여자 & 기억 설정
            </h3>
            <p className="text-xs text-muted-foreground shrink-0">
              체크 해제된 캐릭터는 대화에 절대 개입하지 않습니다. 책 버튼을 눌러 기억을 수정하세요.
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
            </div>
            
            {/* 🌟 확인 버튼 옆에 '대화 기록 정리' 버튼 추가됨 */}
            <div className="flex justify-end gap-2 pt-2 shrink-0">
              <button onClick={handleExtractMemory} disabled={isExtractingMemory} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl active:scale-95 transition-all disabled:opacity-50">
                {isExtractingMemory ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />} 
                대화 기록 정리
              </button>
              <button onClick={() => setShowParticipantModal(false)} className="px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl active:scale-95 transition-all">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달: 기억 수정 */}
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

      {/* 채팅창 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4 relative" style={backgroundStyle}>
        {settings.chatBackground && <div className="absolute inset-0 bg-black/20 pointer-events-none z-0" />}
        
        {messages.map((msg) => (
          <ChatMessageItem 
            key={msg.id}
            msg={msg}
            settings={settings}
            onContextMenu={(e: any, id: string, idx: number | null = null) => { 
              e.preventDefault(); 
              const menuHeight = 160; 
              let safeY = e.clientY;
              if (safeY + menuHeight > window.innerHeight) {
                safeY = window.innerHeight - menuHeight - 16;
              }
              setContextMenu({ id, blockIndex: idx, x: e.clientX, y: safeY }); 
            }}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start pl-9">
            <Loader2 className="animate-spin text-muted-foreground" size={20} />
          </div>
        )}
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <div className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={() => setContextMenu(null)}>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" 
            onClick={handleEditBlockStart}>
            <Edit3 size={14} /> 메시지 {contextMenu.blockIndex !== null ? '수정 (해당 말풍선만)' : '원본 수정'}
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors" onClick={handleDeleteBlock}>
            <X size={14} /> 삭제 {contextMenu.blockIndex !== null ? '(해당 말풍선만)' : ''}
          </button>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors" onClick={handleDeleteFromHere}>
            <Scissors size={14} /> 이후 전체 삭제 {contextMenu.blockIndex !== null ? '(여기부터)' : ''}
          </button>
        </div>
      )}

      {/* 수정 모달 */}
      {editingId && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl p-4 space-y-4 shadow-2xl border border-border">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Edit3 size={16} /> 메시지 {editingBlockIndex !== null ? '수정' : '원본 전체 수정'}
            </h3>
            <textarea 
              value={editValue} 
              onChange={(e) => setEditValue(e.target.value)} 
              className="w-full h-40 bg-muted rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" 
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditingId(null); setEditingBlockIndex(null); }} className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg transition-colors">취소</button>
              <button onClick={handleEditSave} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg active:scale-95 transition-all shadow-md">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 입력 영역 */}
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