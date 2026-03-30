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
  const { conversations, saveConversation, deleteConversation } = useConversations();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const charName = settings.charName || "AI 캐릭터";

  // Handle URL params for loading/new conversations
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && settings.charGreeting) {
      addMessage({ role: "assistant", content: settings.charGreeting });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [contextMenu]);

  const getDefaultSaveTitle = useCallback(() => {
    const name = (settings.charName || "").trim();
    return (name || "새 대화").slice(0, 30);
  }, [settings.charName]);

  // Auto-save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messages.length > 0) {
        try {
          const convs = JSON.parse(localStorage.getItem("saved-conversations") || "[]");
          const title = getDefaultSaveTitle();
          const now = Date.now();
          const lightSettings = {
            ...settings,
            charAvatar: settings.charAvatar && settings.charAvatar.length > 500 ? "" : settings.charAvatar,
            chatBackground: settings.chatBackground && settings.chatBackground.length > 500 ? "" : settings.chatBackground,
          };

          if (currentConvId) {
            const updated = convs.map((c: any) =>
              c.id === currentConvId ? { ...c, messages, title, settings: lightSettings, updatedAt: now } : c
            );
            localStorage.setItem("saved-conversations", JSON.stringify(updated));
          } else {
            const newConv = {
              id: generateUUID(),
              title,
              messages,
              settings: lightSettings,
              createdAt: now,
              updatedAt: now,
            };
            localStorage.setItem("saved-conversations", JSON.stringify([newConv, ...convs]));
          }
        } catch (e) {
          console.warn("Auto-save failed:", e);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [messages, currentConvId, settings, getDefaultSaveTitle]);

  const handleSave = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("저장할 대화가 없습니다");
      return;
    }

    const currentTitle = getDefaultSaveTitle();
    const matchingConvs = conversations.filter((c) => c.title === currentTitle);

    if (matchingConvs.length > 0) {
      const overwrite = window.confirm(`"${currentTitle}" 이름으로 저장된 대화가 이미 있습니다. 덮어쓰시겠습니까?`);
      if (overwrite) {
        const target = matchingConvs.reduce((latest, c) => (c.updatedAt > latest.updatedAt ? c : latest));
        await saveConversation(messages, { existingId: target.id, title: currentTitle, settings });
        const duplicates = matchingConvs.filter((c) => c.id !== target.id);
        for (const d of duplicates) {
          await deleteConversation(d.id);
        }
        setCurrentConvId(target.id);
        toast.success("대화가 덮어쓰기 되었습니다.");
      } else {
        const newTitle = window.prompt("새로운 대화 제목을 입력해주세요:", `${currentTitle} (1)`);
        if (newTitle) {
          const id = await saveConversation(messages, { title: newTitle, settings });
          if (id) {
            setCurrentConvId(id);
            toast.success(`"${newTitle}"(으)로 대화가 저장되었습니다.`);
          }
        }
      }
    } else {
      const id = await saveConversation(messages, { title: currentTitle, settings });
      if (id) {
        setCurrentConvId(id);
        toast.success("대화가 저장되었습니다");
      }
    }
  }, [messages, conversations, saveConversation, deleteConversation, settings, getDefaultSaveTitle]);

  const handleOverwriteConfirm = useCallback(async (overwrite: boolean) => {
    setShowOverwriteDialog(false);
    if (overwrite) {
      await saveConversation(messages, currentConvId || undefined, settings);
      toast.success("대화가 업데이트되었습니다");
    } else {
      const id = await saveConversation(messages, undefined, settings);
      if (id) {
        setCurrentConvId(id);
        toast.success("새 슬롯에 저장되었습니다");
      }
    }
  }, [messages, currentConvId, saveConversation, settings]);

  const handleSend = useCallback(async (overrideContent?: string) => {
    const content = overrideContent !== undefined ? overrideContent : input.trim();
    // Allow empty string (for auto-continue)
    if (content === undefined || isLoading) return;

    const isSystemMessage = content.startsWith("[SYSTEM]");
    const isEmptyMessage = content === "";
    
    if (!isSystemMessage && !isEmptyMessage) {
      addMessage({ role: "user", content });
    }
    setInput("");
    setIsLoading(true);

    const history = [
      ...messages,
      ...(!isSystemMessage && !isEmptyMessage ? [{ role: "user" as const, content }] : []),
    ].map((m) => ({ role: m.role, content: m.content }));

    // Build combined prompt from history and settings
    const systemParts: string[] = [];
    
    if (isSystemMessage) {
      // 조연 소환 시에는 메인 캐릭터 설정을 제외하고 새로운 캐릭터 역할을 부여
      systemParts.push(`[중요 지침] 너는 지금부터 메인 캐릭터인 "${settings.charName}"가 아니야. 현재 상황에 가장 어울리는 완전히 새로운 '조연' 또는 '제3의 인물'이 되어야 해.`);
      systemParts.push(`[조연 역할] 새로운 조연의 이름과 성격을 즉석에서 설정하고, 그 인물의 입장에서 대화와 행동을 이어가줘.`);
      systemParts.push(`[표기 규칙] 조연의 이름과 대사는 반드시 한 개의 메시지(텍스트 상자) 안에 모두 포함해서 답변해줘. 여러 번 나누어 말하지 마.`);
      systemParts.push(`[표기 예시] **경비병**: "거기 누구냐! 여기서 뭘 하는 거지?" (행동 묘사나 나레이션은 별표(*)로 감싸줘)`);
    } else if (isEmptyMessage) {
      // 자동 진행 시 지침
      systemParts.push(`너의 이름은 "${settings.charName}"이야.`);
      if (settings?.charPersona) systemParts.push(`너의 성격과 말투: ${settings.charPersona}`);
      systemParts.push(`[자동 진행 지침] 유저의 입력이 없으므로, 현재 상황과 분위기에 맞춰서 "${settings.charName}"의 다음 행동, 대사, 혹은 주변 환경 묘사를 자연스럽게 이어가줘. 유저의 입장에서 생각해서 유저가 할 만한 행동을 짧게 묘사해도 좋아.`);
    } else {
      // 일반 대화 시 지침
      if (settings?.charName) systemParts.push(`너의 이름은 "${settings.charName}"이야.`);
      if (settings?.charPersona) systemParts.push(`너의 성격과 말투: ${settings.charPersona}`);
    }

    if (settings?.worldSetting) systemParts.push(`대화의 배경(세계관): ${settings.worldSetting}`);
    if (settings?.myName) systemParts.push(`상대방(유저)의 이름은 "${settings.myName}"이야.`);
    if (settings?.myIntro) systemParts.push(`상대방 소개: ${settings.myIntro}`);
    if (settings?.note) systemParts.push(`[중요 노트]\n${settings.note}`);

    systemParts.push(`[응답 규칙] 답변은 반드시 5줄 이내로 짧게 해줘. 내용이 길어질 경우 "[[SPLIT]]" 구분자를 넣어줘.`);

    const systemPrompt = systemParts.join("\n\n");
    const chatHistory = history.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[대화 기록]\n${chatHistory}\n\nAI:`;

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
          // Split handling if needed
          if (fullContent.includes(SPLIT_MARKER)) {
            const parts = fullContent.split(SPLIT_MARKER).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              updateLastAssistant(parts[0]);
              for (let i = 1; i < parts.length; i++) {
                addMessage({ role: "assistant", content: parts[i] });
              }
            }
          }
        },
        onError: (errorMsg) => {
          setIsLoading(false);
          toast.error(errorMsg);
          if (!assistantStarted) {
            addMessage({ role: "assistant", content: `⚠️ ${errorMsg}` });
          }
        }
      });
    } catch (error: any) {
      setIsLoading(false);
      const errorMsg = error.message || "네트워크 오류가 발생했습니다.";
      toast.error(errorMsg);
      if (!assistantStarted) {
        addMessage({ role: "assistant", content: `⚠️ ${errorMsg}` });
      }
    }
  }, [input, isLoading, messages, settings, addMessage, updateLastAssistant]);

  const handleSummonCharacter = useCallback(() => {
    if (isLoading) return;
    
    // 설정된 조연 캐릭터가 있다면 랜덤하게 하나 선택하거나 목록을 보여줄 수 있음
    // 여기서는 간단하게 설정된 조연이 있으면 그 정보를 활용하도록 프롬프트 수정
    const supportingChars = settings.supportingCharacters || [];
    let summonPrompt = "";
    
    if (supportingChars.length > 0) {
      const charList = supportingChars.map(c => `- ${c.name}: ${c.persona}`).join("\n");
      summonPrompt = `[SYSTEM] 다음 조연 캐릭터 중 한 명을 등장시켜 이야기를 계속 진행해주세요. 만약 특정 인물을 고르기 어렵다면 상황에 맞는 새로운 인물을 만들어도 좋습니다.\n\n[설정된 조연 목록]\n${charList}\n\n조연의 이름과 대사는 반드시 굵은 글씨(**)로 강조해서 표현해야 합니다.`;
    } else {
      summonPrompt = `[SYSTEM] 메인 캐릭터인 "${settings.charName}"를 제외하고, 현재 상황에 어울리는 새로운 조연 캐릭터를 등장시켜 대화와 행동을 이어가주세요. 조연의 이름과 대사는 반드시 굵은 글씨(**)로 강조해서 표현해야 합니다.`;
    }
    
    handleSend(summonPrompt);
  }, [isLoading, handleSend, settings.charName, settings.supportingCharacters]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNarration = useCallback(() => {
    if (isLoading) return;
    const trimmed = input.trim();
    const narrationText = trimmed ? `*${trimmed}*` : "";
    if (narrationText) {
      handleSend(narrationText);
    } else {
      // Empty narration = just add asterisks to input
      setInput("**");
    }
  }, [input, isLoading, handleSend]);

  const handleGenerateImage = useCallback(async () => {
    if (isLoading || isGeneratingImage) return;
    if (messages.length === 0) {
      toast.error("대화 내용이 없어 이미지를 생성할 수 없습니다");
      return;
    }

    setIsGeneratingImage(true);
    const toastId = toast.loading("이미지 생성 중...");

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { imageUrl, prompt } = await generateImage(
        history,
        settings,
        (status) => toast.loading(status, { id: toastId }),
      );

      addMessage({
        role: "assistant",
        content: encodeImageMessage(imageUrl, prompt),
      });

      toast.success("이미지가 생성되었습니다!", { id: toastId });
    } catch (e) {
      console.error("Image generation error:", e);
      const errorMsg = e instanceof Error ? e.message : "이미지 생성 실패";
      toast.error(errorMsg, { id: toastId });
    } finally {
      setIsGeneratingImage(false);
    }
  }, [isLoading, isGeneratingImage, messages, settings, addMessage]);

  const handleLongPress = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setContextMenu({ id, x: clientX, y: clientY });
  };

  // Render message content - narration (*text*) gets special styling
  const renderContent = (msg: { role: string; content: string }) => {
    // Check for image message
    const imgData = decodeImageMessage(msg.content);
    if (imgData) {
      return <ImageCard url={imgData.url} prompt={imgData.prompt} />;
    }

    if (msg.role === "assistant") {
      return (
        <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>p+p]:mt-2 [&_em]:not-italic [&_em]:text-muted-foreground/80 [&_p>em]:text-muted-foreground/80">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }
    const isNarration = msg.content.startsWith("*") && msg.content.endsWith("*") && msg.content.length > 2;
    if (isNarration) {
      return <span className="italic text-muted-foreground">{msg.content.slice(1, -1)}</span>;
    }
    return msg.content;
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 text-foreground active:opacity-70 transition-opacity"
        >
          {settings.charAvatar && (
            <img 
              src={settings.charAvatar} 
              alt={charName} 
              className="w-9 h-9 rounded-full object-cover bg-muted" 
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const next = (e.target as HTMLImageElement).nextElementSibling;
                if (next) (next as HTMLElement).style.display = "flex";
              }}
            />
          )}
          <div 
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0"
            style={{ display: settings.charAvatar ? "none" : "flex" }}
          >
            {charName[0]}
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">{charName}</p>
            <p className="text-xs text-muted-foreground">설정하려면 탭하세요</p>
          </div>
        </button>
        <div className="flex gap-1">
          <button onClick={handleGenerateImage} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors" title="현재 상황 이미지 생성">
            {isGeneratingImage ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
          </button>
          <button onClick={handleSave} className="p-2 rounded-lg text-muted-foreground hover:text-primary transition-colors" title="대화 저장">
            <Save size={18} />
          </button>
          <button onClick={() => navigate("/conversations")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="저장된 대화">
            <List size={18} />
          </button>
          <button onClick={clearMessages} className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="대화 초기화">
            <Trash2 size={18} />
          </button>
          <button onClick={() => navigate("/settings")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-3 relative"
        style={settings.chatBackground ? {
          backgroundImage: `url(${settings.chatBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
        {messages.map((msg) => {
          const isSupporting = msg.role === "assistant" && msg.content.trim().startsWith("**");
          
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} relative z-10`}
              onContextMenu={(e) => handleLongPress(msg.id, e)}
            >
              {msg.role === "assistant" && !isSupporting && (
                settings.charAvatar ? (
                  <img 
                    src={settings.charAvatar} 
                    alt={charName} 
                    className="w-7 h-7 rounded-full object-cover mr-2 mt-1 shrink-0 bg-muted" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      const next = (e.target as HTMLImageElement).nextElementSibling;
                      if (next) (next as HTMLElement).style.display = "flex";
                    }}
                  />
                ) : null
              )}
              {msg.role === "assistant" && !isSupporting && (!settings.charAvatar || true) && (
                <div 
                  className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold mr-2 mt-1 shrink-0"
                  style={{ display: settings.charAvatar ? "none" : "flex" }}
                >
                  {charName[0]}
                </div>
              )}
              {isSupporting && (
                <div className="w-7 mr-2 shrink-0" /> // Space for hidden avatar
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-chat-mine text-chat-mine-foreground rounded-br-md whitespace-pre-wrap"
                    : "bg-chat-theirs text-chat-theirs-foreground rounded-bl-md"
                }`}
              >
                {renderContent(msg)}
              </div>
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start relative z-10">
            <div className="bg-chat-theirs text-chat-theirs-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
              <Loader2 size={16} className="animate-spin" />
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
            onClick={() => {
              deleteMessage(contextMenu.id);
              setContextMenu(null);
              toast.success("메시지가 삭제되었습니다");
            }}
          >
            <X size={14} />
            이 메시지 삭제
          </button>
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors"
            onClick={() => {
              deleteMessagesFrom(contextMenu.id);
              setContextMenu(null);
              toast.success("이 메시지 이전까지 삭제되었습니다");
            }}
          >
            <Scissors size={14} />
            여기까지 삭제
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-card px-3 py-2 safe-area-bottom">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
            style={{ minHeight: "40px" }}
          />
          <button
            onClick={handleNarration}
            disabled={isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center disabled:opacity-40 transition-opacity active:scale-95"
            title="나레이션 (별표로 감싸서 전송)"
          >
            <Star size={18} />
          </button>
          <button
            onClick={handleSummonCharacter}
            disabled={isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity active:scale-95"
            title="조연 등장시키기"
          >
            <Users size={18} />
          </button>
          <button
            onClick={() => handleSend(input.trim() === "" ? "" : undefined)}
            disabled={isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Overwrite dialog */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>대화 저장</DialogTitle>
            <DialogDescription>
              이미 저장된 대화입니다. 기존 슬롯을 덮어쓰시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => handleOverwriteConfirm(false)}>
              새로 저장
            </Button>
            <Button className="flex-1" onClick={() => handleOverwriteConfirm(true)}>
              덮어쓰기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPage;
