import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, LogOut, Trash2, Plus, Trash, Key, Eye, EyeOff, Eraser, Bot, Loader2, MessageSquare } from "lucide-react";
import { useSettings, useConversations, useMessages, type AppSettings, type SupportingCharacter, type ExtraApiKey } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import ImageUploadField from "@/components/ImageUploadField";
import CharacterSearch from "@/components/CharacterSearch";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import { searchWorld } from "@/lib/gemini-api";
import { streamChat } from "@/lib/chat-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const _extractedNpcs: { name: string; persona: string }[] = [];
let _extractNpcIndex = 0;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{title}</h2>
    <div className="space-y-3 rounded-xl bg-card p-4 border border-border">{children}</div>
  </section>
);

const Field = ({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-foreground">{label}</label>
    {multiline ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    )}
  </div>
);

const SettingsPage = () => {
  const navigate = useNavigate();
  const { settings, setSettings, resetRPContent } = useSettings();
  const { allConversations, deleteConversation, showAutoSaves, setShowAutoSaves } = useConversations();
  const { messages, clearMessages } = useMessages();
  const { user, signOut } = useAuth();
  const [form, setForm] = useState<AppSettings>(settings);
  const [worldQuery, setWorldQuery] = useState("");
  const [isWorldSearching, setIsWorldSearching] = useState(false);
  const [isExtractingId, setIsExtractingId] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddCharacter = () => {
    const newChar: SupportingCharacter = { id: generateUUID(), name: "", persona: "", avatar: "" };
    update("supportingCharacters", [...form.supportingCharacters, newChar]);
  };

  const handleRemoveCharacter = (id: string) => {
    update("supportingCharacters", form.supportingCharacters.filter((c) => c.id !== id));
  };

  const handleUpdateCharacter = (id: string, field: keyof SupportingCharacter, value: string) => {
    update("supportingCharacters", form.supportingCharacters.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleAutoFillSupporting = (id: string, data: any) => {
    setForm((prev) => ({
      ...prev,
      supportingCharacters: prev.supportingCharacters.map((c) => 
        c.id === id ? { ...c, name: data.name || c.name, persona: data.persona || c.persona, avatar: data.avatar || c.avatar } : c
      )
    }));
  };

  const handleAddApiKey = () => {
    const selected = form.selectedModel || "gemini-3.5-flash";
    const providerName = selected.startsWith("groq/") || selected.startsWith("llama-")
      ? "Groq"
      : selected.startsWith("nvidia/") || selected.startsWith("openrouter/") ||
        selected.startsWith("qwen/") || selected.startsWith("z-ai/") || selected.includes(":free")
        ? "OpenRouter"
        : "Gemini";
    const newKey: ExtraApiKey = { id: generateUUID(), name: providerName, value: "" };
    update("extraApiKeys", [...form.extraApiKeys, newKey]);
  };

  const handleRemoveApiKey = (id: string) => {
    update("extraApiKeys", form.extraApiKeys.filter((k) => k.id !== id));
  };

  const handleUpdateApiKey = (id: string, field: keyof ExtraApiKey, value: string) => {
    update("extraApiKeys", form.extraApiKeys.map((k) => (k.id === id ? { ...k, [field]: value } : k)));
  };

  const handleSave = () => {
    setSettings(form);
    toast.success("설정이 저장되었습니다!");
    navigate("/");
  };

  const handleWorldSearch = async () => {
    if (!worldQuery.trim() || isWorldSearching) return;
    setIsWorldSearching(true);
    try {
      const data = await searchWorld(worldQuery.trim());
      if (!data.worldSetting) {
        toast.error("세계관 정보를 생성하지 못했습니다.");
        return;
      }
      update("worldSetting", data.worldSetting);
      toast.success("세계관이 자동으로 채워졌습니다!");
    } catch (e) {
      toast.error("세계관 검색에 실패했습니다.");
    } finally {
      setIsWorldSearching(false);
    }
  };

  const handleFullReset = async () => {
    if (window.confirm("중요 정보(로그인, API키, 모델)를 제외한 모든 프로필, 세계관, 이미지, 노트를 초기화하시겠습니까?")) {
      await resetRPContent();
      clearMessages();
      toast.success("컨텐츠 초기화가 완료되었습니다.");
    }
  };

  /**
   * 조연 정보 추출: streamChat 기반 통합 처리 (Gemini 다중 키 자동 순환 및 LM Studio 완벽 지원)
   */
  const handleExtractNPC = async (charId: string) => {
    if (messages.length === 0) {
      toast.error("현재 대화 기록이 없습니다. 먼저 채팅방에서 대화를 진행해주세요.");
      return;
    }

    setIsExtractingId(charId);
    const toastId = toast.loading("최근 대화에서 조연을 분석하고 있습니다...");

    try {
      if (_extractedNpcs.length === 0) {
        const history = messages.slice(-20).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`).join("\n");

        const prompt = `너는 대화 분석가이다. 아래 최근 대화 기록을 읽고, 주연(${form.charName})과 유저(${form.myName || "유저"})를 제외한 '새로운 조연(엑스트라/NPC)'을 찾아내라.
반드시 아래 JSON 배열 포맷으로만 응답하라. 설명이나 마크다운은 붙이지 마라.
[{"name": "조연이름", "persona": "조연설정 및 성격"}]
발견된 조연이 전혀 없다면 반드시 [] 라고만 응답하라.

[대화 기록]
${history}

JSON:`;

        let rawResponse = "";
        await streamChat({
          message: prompt,
          settings: form,
          onDelta: (delta) => { rawResponse += delta; },
          onDone: () => {},
          onError: (err) => { throw new Error(err); }
        });

        // 결과 정제 및 JSON 파싱
        let cleaned = rawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
        const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) cleaned = jsonMatch[0];

        let npcs: any[] = [];
        try {
          npcs = JSON.parse(cleaned);
        } catch (e) {
          npcs = [];
        }

        if (!Array.isArray(npcs) || npcs.length === 0) {
          toast.info("최근 대화에서 새로운 조연을 찾지 못했습니다.", { id: toastId });
          setIsExtractingId(null);
          return;
        }

        _extractedNpcs.length = 0;
        _extractedNpcs.push(...npcs);
        _extractNpcIndex = 0;
      }

      const npc = _extractedNpcs[_extractNpcIndex];
      handleAutoFillSupporting(charId, { name: npc.name, persona: npc.persona });

      toast.success(
        `'${npc.name}' 정보 적용됨 (${_extractNpcIndex + 1}/${_extractedNpcs.length}명)`,
        { id: toastId }
      );

      _extractNpcIndex = (_extractNpcIndex + 1) % _extractedNpcs.length;
    } catch (error: any) {
      console.error("추출 에러:", error);
      toast.error(`조연 추출 실패: ${error.message || "알 수 없는 오류"}`, { id: toastId });
    } finally {
      setIsExtractingId(null);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 z-10">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg text-foreground active:opacity-50">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-foreground">설정</h1>
        <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform">
          <Save size={14} /> 저장
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        <Section title="계정">
          {user ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">Google 계정으로 로그인됨</p>
              </div>
              <button onClick={async () => { await signOut(); toast.success("로그아웃 되었습니다"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm hover:bg-muted/80">
                <LogOut size={14} /> 로그아웃
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-sm text-muted-foreground">로그인하면 클라우드에 저장됩니다</p>
              <GoogleLoginButton />
            </div>
          )}
        </Section>

        <Section title="내 프로필">
          <Field label="이름" value={form.myName} onChange={(v) => update("myName", v)} placeholder="내 이름" />
          <Field label="소개" value={form.myIntro} onChange={(v) => update("myIntro", v)} multiline placeholder="자기소개 또는 내 캐릭터 설정" />
        </Section>

        <Section title="AI 캐릭터 프로필">
          <CharacterSearch onSelect={(data) => {
            setForm((prev) => ({ ...prev, charName: data.name || prev.charName, charPersona: data.persona || prev.charPersona, charGreeting: data.greeting || prev.charGreeting, charAvatar: data.avatar || prev.charAvatar }));
            toast.success("정보가 자동으로 채워졌습니다!");
          }} />
          <ImageUploadField label="캐릭터 프로필 이미지" value={form.charAvatar} onChange={(v) => update("charAvatar", v)} hint="캐릭터의 얼굴로 표시됩니다" />
          <Field label="캐릭터 이름" value={form.charName} onChange={(v) => update("charName", v)} placeholder="AI 캐릭터" />
          <Field label="성격 (페르소나)" value={form.charPersona} onChange={(v) => update("charPersona", v)} multiline placeholder="성격과 말투" />
          <Field label="첫 인사말" value={form.charGreeting} onChange={(v) => update("charGreeting", v)} multiline placeholder="첫 인사말" />
        </Section>

        <Section title="조연 캐릭터 관리">
          <div className="space-y-4">
            {form.supportingCharacters.map((char) => (
              <div key={char.id} className="p-4 pt-10 rounded-xl bg-muted/30 border border-border relative space-y-3">
                <button
                  onClick={() => handleRemoveCharacter(char.id)}
                  className="absolute top-2 right-2 p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors z-10"
                  title="조연 삭제"
                >
                  <Trash size={16} />
                </button>
                
                <div className="mb-3 space-y-2">
                  <CharacterSearch onSelect={(data) => { handleAutoFillSupporting(char.id, data); toast.success("조연 정보가 자동으로 채워졌습니다!"); }} />
                  <button 
                    onClick={() => handleExtractNPC(char.id)}
                    disabled={isExtractingId === char.id}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium transition-colors border border-primary/20"
                  >
                    {isExtractingId === char.id ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                    최근 대화에서 조연 정보 추출
                  </button>
                </div>
                
                <ImageUploadField label="조연 프로필 이미지" value={char.avatar} onChange={(v) => handleUpdateCharacter(char.id, "avatar", v)} />
                <Field label="조연 이름" value={char.name} onChange={(v) => handleUpdateCharacter(char.id, "name", v)} placeholder="조연 이름" />
                <Field label="조연 설정" value={char.persona} onChange={(v) => handleUpdateCharacter(char.id, "persona", v)} multiline placeholder="성격, 관계 등" />
              </div>
            ))}
            <button onClick={handleAddCharacter} className="w-full py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted/50 hover:text-foreground transition-all">
              <Plus size={18} /> 조연 추가하기
            </button>
          </div>
        </Section>

        <Section title="참여자 & 기억 설정">
          <p className="text-xs text-muted-foreground">조연을 삭제하면 대화 참여자 목록에서도 제거됩니다.</p>
          <div className="space-y-2">
            {form.supportingCharacters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">추가된 조연이 없습니다.</p>
            ) : (
              form.supportingCharacters.map((char) => (
                <div key={char.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium truncate">{char.name || "(이름 없음)"}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{char.persona || "(설정 없음)"}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`'${char.name || "이 조연"}' 을(를) 삭제할까요?`)) {
                        handleRemoveCharacter(char.id);
                        toast.success("조연이 삭제되었습니다.");
                      }
                    }}
                    className="ml-3 p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                    title="삭제"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </Section>

        <Section title="채팅방 꾸미기">
          <ImageUploadField label="채팅 배경 이미지" value={form.chatBackground} onChange={(v) => update("chatBackground", v)} hint="채팅방 전체 배경으로 적용됩니다" />
        </Section>

        <Section title="답변 길이 설정">
          <p className="text-xs text-muted-foreground mb-2">
            AI가 한 번 대답할 때 생성할 박스 갯수와 글자 수 범위를 조절합니다. 상황에 맞춰 최소~최대 범위 내에서 유동적으로 조절합니다.
          </p>
          
          <div className="space-y-4">
            {/* 나레이션 설정 */}
            <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">📝 나레이션 (상황 묘사)</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field type="number" label="박스 갯수" value={(form as any).narrationCount || "3"} onChange={(v) => update("narrationCount" as any, v)} placeholder="예: 3" />
                <Field type="number" label="최소 글자수" value={(form as any).narrationMinLength || "30"} onChange={(v) => update("narrationMinLength" as any, v)} placeholder="예: 30" />
                <Field type="number" label="평균 글자수" value={(form as any).narrationLength || "50"} onChange={(v) => update("narrationLength" as any, v)} placeholder="예: 50" />
                <Field type="number" label="최대 글자수" value={(form as any).narrationMaxLength || "100"} onChange={(v) => update("narrationMaxLength" as any, v)} placeholder="예: 100" />
              </div>
            </div>

            {/* 주연 대사 설정 */}
            <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">👑 주연 대사</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field type="number" label="박스 갯수" value={(form as any).mainCharCount || "2"} onChange={(v) => update("mainCharCount" as any, v)} placeholder="예: 2" />
                <Field type="number" label="최소 글자수" value={(form as any).mainCharMinLength || "10"} onChange={(v) => update("mainCharMinLength" as any, v)} placeholder="예: 10" />
                <Field type="number" label="평균 글자수" value={(form as any).mainCharLength || "30"} onChange={(v) => update("mainCharLength" as any, v)} placeholder="예: 30" />
                <Field type="number" label="최대 글자수" value={(form as any).mainCharMaxLength || "80"} onChange={(v) => update("mainCharMaxLength" as any, v)} placeholder="예: 80" />
              </div>
            </div>

            {/* 조연 대사 설정 */}
            <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">👥 조연 대사</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field type="number" label="박스 갯수" value={(form as any).extraCharCount || "2"} onChange={(v) => update("extraCharCount" as any, v)} placeholder="예: 2" />
                <Field type="number" label="최소 글자수" value={(form as any).extraCharMinLength || "10"} onChange={(v) => update("extraCharMinLength" as any, v)} placeholder="예: 10" />
                <Field type="number" label="평균 글자수" value={(form as any).extraCharLength || "30"} onChange={(v) => update("extraCharLength" as any, v)} placeholder="예: 30" />
                <Field type="number" label="최대 글자수" value={(form as any).extraCharMaxLength || "80"} onChange={(v) => update("extraCharMaxLength" as any, v)} placeholder="예: 80" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="세계관 및 AI 설정">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">세계관 자동 생성</label>
            <div className="flex gap-2">
              <input type="text" value={worldQuery} onChange={(e) => setWorldQuery(e.target.value)} placeholder="키워드 입력 (예: 중세 판타지)" className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={handleWorldSearch} disabled={isWorldSearching} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {isWorldSearching ? "..." : "생성"}
              </button>
            </div>
          </div>
          <Field label="상세 세계관" value={form.worldSetting} onChange={(v) => update("worldSetting", v)} multiline placeholder="시대상, 배경 설명" />
          <Field label="노트 (장기 기억)" value={form.note} onChange={(v) => update("note", v)} multiline placeholder="AI가 기억해야 할 특별한 사건이나 정보" />
          
          <Field 
            label="절대 규칙 (답변 길이 및 말투 강제)" 
            value={form.chatRule} 
            onChange={(v) => update("chatRule", v)} 
            multiline 
            placeholder="예: 답변은 무조건 3문장 이내로 해. 절대 길게 말하지 마." 
          />

          <div className="mt-6 pt-5 border-t border-border/50 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Bot size={16} className="text-primary" /> 사용할 AI 모델
              </label>
              <select
                value={form.selectedModel || "local/qwen-14b"}
                onChange={(e) => update("selectedModel", e.target.value)}
                className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring border border-border"
              >
                {/* 작동 확인된 기존 연결은 유지 */}
                <optgroup label="내 노트북 로컬 구동 (LM Studio)">
                  <option value="local/qwen-14b">Qwen 2.5 14B Abliterated (LM Studio 로컬)</option>
                  <option value="local/custom">기타 LM Studio에 로드된 모델</option>
                </optgroup>

                <optgroup label="Google Gemini API (Google AI Studio 키)">
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                  <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                  <option value="gemini-3.7-flash">Gemini 3.7 Flash</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                </optgroup>

                <optgroup label="OpenRouter 무료 채팅 모델 (OpenRouter API 키 필요)">
                  <option value="google/gemma-4-31b-it:free">Gemma 4 31B (무료, 대화 품질 우선 후보)</option>
                  <option value="google/gemma-4-26b-a4b-it:free">Gemma 4 26B A4B (무료, 속도·품질 균형)</option>
                  <option value="nvidia/nemotron-3-super-120b-a12b:free">Nemotron 3 Super (무료, 복잡한 설정·추론)</option>
                  <option value="nvidia/nemotron-3-ultra-550b-a55b:free">Nemotron 3 Ultra 550B (초거대 지능)</option>
                  <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free">Nemotron 3 Nano Omni (무료, 멀티모달)</option>
                  <option value="cohere/north-mini-code:free">Cohere North Mini Code (무료, 코딩 중심)</option>
                  <option value="poolside/laguna-xs-2.1:free">Poolside Laguna XS 2.1 (무료, 코딩 중심 · 10/31 종료 예정)</option>
                </optgroup>
              </select>
            </div>

            {/* 🌟 [추가됨] Vercel 접속용 LM Studio 외부 주소 입력칸 (로컬 모델 선택 시에만 등장) */}
            {form.selectedModel?.includes("local") && (
              <div className="space-y-2 pb-2 mt-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  🌐 외부 접속용 LM Studio 주소 (Vercel 환경 필수)
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Vercel 앱에서 노트북의 AI를 쓰려면 Ngrok 등으로 생성한 <b>https://</b> 주소가 필요합니다. (미입력 시 기본 localhost 사용)
                </p>
                <input 
                  type="text" 
                  value={(form as any).lmStudioUrl || ""} 
                  onChange={(e) => update("lmStudioUrl" as any, e.target.value)} 
                  placeholder="예: https://intercatenated-contractedly-adela.ngrok-free.dev" 
                  className="w-full rounded-lg bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 border border-border" 
                />
              </div>
            )}

            <div className="space-y-2 pb-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Key size={16} className="text-primary" /> 기본 Gemini API Key
              </label>
              <p className="text-[11px] text-muted-foreground">
                Google AI Studio Gemini API 키 전용 칸입니다. 여러 키는 쉼표 또는 줄바꿈으로 구분하세요. 아래 OpenRouter 무료 모델은 API 키 관리에서 OpenRouter 키를 등록해 사용하세요.
              </p>
              <textarea 
                value={form.geminiApiKey || ""} 
                onChange={(e) => update("geminiApiKey", e.target.value)} 
                placeholder="AIzaSy...1, AIzaSy...2, AIzaSy...3" 
                rows={2}
                className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono text-xs" 
              />
            </div>

            <div className="space-y-3 pt-3 border-t border-border/30">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Key size={16} className="text-muted-foreground" /> API 키 관리 (모델 제공자별)
              </label>
              
              {form.extraApiKeys.map((apiKeyObj) => (
                <div key={apiKeyObj.id} className="flex gap-2 items-center p-3 rounded-xl bg-muted/30 border border-border">
                  <div className="flex-1 space-y-2">
                    <select
                      value={apiKeyObj.name}
                      onChange={(e) => handleUpdateApiKey(apiKeyObj.id, "name", e.target.value)}
                      className="w-full rounded-md bg-background px-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {/* 🌟 Gemini 대체 키 옵션 추가 */}
                      <option value="Gemini">Gemini (추가/대체 키)</option>
                      <option value="Groq">Groq (기존 설정 호환)</option>
                      <option value="OpenRouter">OpenRouter (무료 채팅 모델)</option>
                      <option value="Cohere">Cohere (기존 호환)</option>
                      <option value="GitHub">GitHub Models (기존 호환)</option>
                    </select>

                    <input 
                      type="password" 
                      value={apiKeyObj.value} 
                      onChange={(e) => handleUpdateApiKey(apiKeyObj.id, "value", e.target.value)} 
                      placeholder={apiKeyObj.name === "Groq" ? "Groq API 키 (gsk_...)" : apiKeyObj.name === "OpenRouter" ? "OpenRouter API 키 (sk-or-v1-...)" : apiKeyObj.name === "Gemini" ? "Gemini API 키 (AIza...)" : "API 키 입력"} 
                      className="w-full rounded-md bg-background px-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring" 
                    />
                  </div>
                  <button 
                    onClick={() => handleRemoveApiKey(apiKeyObj.id)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                    title="키 삭제"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
              
              <button 
                onClick={handleAddApiKey}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-border text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted/50 hover:text-foreground transition-all text-sm"
              >
                <Plus size={16} /> 새 API 키 추가
              </button>
            </div>
          </div>
        </Section>

        <Section title="데이터 관리">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-1">
              <div>
                <p className="text-sm font-medium text-foreground">컨텐츠 초기화</p>
                <p className="text-xs text-muted-foreground">모든 프로필, 조연, 이미지, 노트를 삭제합니다</p>
              </div>
              <button onClick={handleFullReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive text-destructive text-sm font-medium active:scale-95 transition-transform">
                <Eraser size={14} /> 초기화
              </button>
            </div>
            <div className="flex items-center justify-between p-1 pt-2 border-t border-border/30">
              <div>
                <p className="text-sm font-medium">자동저장 파일 표시</p>
                <p className="text-xs text-muted-foreground">목록에서 자동저장 파일을 숨기거나 보여줍니다</p>
              </div>
              <button onClick={() => setShowAutoSaves(!showAutoSaves)} className={`p-2 rounded-lg transition-colors ${showAutoSaves ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {showAutoSaves ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <div>
                <p className="text-sm font-medium text-foreground">모든 대화 기록 삭제</p>
                <p className="text-xs text-muted-foreground">저장된 {allConversations.length}개의 대화를 모두 삭제합니다</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button disabled={allConversations.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium active:scale-95 transition-transform disabled:opacity-40">
                    <Trash2 size={14} /> 삭제
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>모든 대화를 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>이 작업은 되돌릴 수 없으며 대화 기록이 영구적으로 소멸됩니다.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl">취소</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive rounded-xl" onClick={async () => { for (const c of allConversations) await deleteConversation(c.id); toast.success("모든 대화가 삭제되었습니다."); }}>삭제</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default SettingsPage;