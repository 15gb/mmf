import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, LogOut, Trash2, Users, Plus, Trash, Key, Eye, EyeOff, ImageIcon, Eraser } from "lucide-react";
import { useSettings, useConversations, useMessages, type AppSettings, type SupportingCharacter } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { generateUUID } from "@/lib/utils";
import { toast } from "sonner";
import ImageUploadField from "@/components/ImageUploadField";
import CharacterSearch from "@/components/CharacterSearch";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import { searchWorld } from "@/lib/gemini-api";
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
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
        type="text"
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
  const { clearMessages } = useMessages();
  const { user, signOut } = useAuth();
  const [form, setForm] = useState<AppSettings>(settings);
  const [worldQuery, setWorldQuery] = useState("");
  const [isWorldSearching, setIsWorldSearching] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** 🌟 [조연 캐릭터 관리 로직] */
  const handleAddCharacter = () => {
    const newChar: SupportingCharacter = {
      id: generateUUID(),
      name: "",
      persona: "",
      avatar: "",
    };
    update("supportingCharacters", [...form.supportingCharacters, newChar]);
  };

  const handleRemoveCharacter = (id: string) => {
    update("supportingCharacters", form.supportingCharacters.filter((c) => c.id !== id));
  };

  const handleUpdateCharacter = (id: string, field: keyof SupportingCharacter, value: string) => {
    update(
      "supportingCharacters",
      form.supportingCharacters.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  /** 🌟 [추가됨] 조연 캐릭터 AI 자동 완성 적용 로직 */
  const handleAutoFillSupporting = (id: string, data: any) => {
    setForm((prev) => ({
      ...prev,
      supportingCharacters: prev.supportingCharacters.map((c) => 
        c.id === id 
          ? {
              ...c,
              name: data.name || c.name,
              persona: data.persona || c.persona,
              avatar: data.avatar || c.avatar,
            }
          : c
      )
    }));
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
    if (window.confirm("중요 정보(로그인, API키)를 제외한 모든 프로필, 세계관, 이미지, 노트를 초기화하시겠습니까?")) {
      await resetRPContent();
      clearMessages();
      toast.success("컨텐츠 초기화가 완료되었습니다.");
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 z-10">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg text-foreground active:opacity-50">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-foreground">설정</h1>
        <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform">
          <Save size={14} /> 저장
        </button>
      </header>

      {/* Form Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* 1. 계정 섹션 */}
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

        {/* 2. 내 프로필 섹션 */}
        <Section title="내 프로필">
          <Field label="이름" value={form.myName} onChange={(v) => update("myName", v)} placeholder="내 이름" />
          <Field label="소개" value={form.myIntro} onChange={(v) => update("myIntro", v)} multiline placeholder="자기소개 또는 내 캐릭터 설정" />
        </Section>

        {/* 3. AI 캐릭터 프로필 섹션 */}
        <Section title="AI 캐릭터 프로필">
          <CharacterSearch onSelect={(data) => {
            setForm((prev) => ({
              ...prev,
              charName: data.name || prev.charName,
              charPersona: data.persona || prev.charPersona,
              charGreeting: data.greeting || prev.charGreeting,
              charAvatar: data.avatar || prev.charAvatar,
            }));
            toast.success("정보가 자동으로 채워졌습니다!");
          }} />
          <ImageUploadField label="캐릭터 프로필 이미지" value={form.charAvatar} onChange={(v) => update("charAvatar", v)} hint="캐릭터의 얼굴로 표시됩니다" />
          <Field label="캐릭터 이름" value={form.charName} onChange={(v) => update("charName", v)} placeholder="AI 캐릭터" />
          <Field label="성격 (페르소나)" value={form.charPersona} onChange={(v) => update("charPersona", v)} multiline placeholder="성격과 말투" />
          <Field label="첫 인사말" value={form.charGreeting} onChange={(v) => update("charGreeting", v)} multiline placeholder="첫 인사말" />
        </Section>

        {/* 4. ⭐ 조연 캐릭터 관리 섹션 (AI 검색 기능 추가) */}
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
                
                {/* 🌟 조연 검색용 AI 자동 완성 컴포넌트 추가 */}
                <div className="mb-2">
                  <CharacterSearch onSelect={(data) => {
                    handleAutoFillSupporting(char.id, data);
                    toast.success("조연 정보가 자동으로 채워졌습니다!");
                  }} />
                </div>

                <ImageUploadField 
                  label="조연 프로필 이미지" 
                  value={char.avatar} 
                  onChange={(v) => handleUpdateCharacter(char.id, "avatar", v)} 
                />
                <Field 
                  label="조연 이름" 
                  value={char.name} 
                  onChange={(v) => handleUpdateCharacter(char.id, "name", v)} 
                  placeholder="조연 이름" 
                />
                <Field 
                  label="조연 설정" 
                  value={char.persona} 
                  onChange={(v) => handleUpdateCharacter(char.id, "persona", v)} 
                  multiline 
                  placeholder="성격, 관계 등" 
                />
              </div>
            ))}
            <button 
              onClick={handleAddCharacter}
              className="w-full py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground flex items-center justify-center gap-2 hover:bg-muted/50 hover:text-foreground transition-all"
            >
              <Plus size={18} /> 조연 추가하기
            </button>
          </div>
        </Section>

        {/* 5. 채팅방 꾸미기 섹션 */}
        <Section title="채팅방 꾸미기">
          <ImageUploadField 
            label="채팅 배경 이미지" 
            value={form.chatBackground} 
            onChange={(v) => update("chatBackground", v)} 
            hint="채팅방 전체 배경으로 적용됩니다" 
          />
        </Section>

        {/* 6. 세계관 및 노트 섹션 */}
        <Section title="세계관 및 노트">
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

          {/* API 키 설정 */}
          <div className="mt-6 pt-5 border-t border-border/50 space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key size={16} className="text-primary" /> Gemini API Key
            </label>
            <input type="password" value={form.geminiApiKey || ""} onChange={(e) => update("geminiApiKey", e.target.value)} placeholder="AIzaSy..." className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-[10px] text-muted-foreground italic px-1">* 쉼표(,)로 구분하여 최대 3개까지 로테이션 가능합니다.</p>
          </div>
        </Section>

        {/* 7. 데이터 관리 섹션 */}
        <Section title="데이터 관리">
          <div className="space-y-4">
            {/* 컨텐츠 초기화 버튼 */}
            <div className="flex items-center justify-between p-1">
              <div>
                <p className="text-sm font-medium text-foreground">컨텐츠 초기화</p>
                <p className="text-xs text-muted-foreground">모든 프로필, 조연, 이미지, 노트를 삭제합니다</p>
              </div>
              <button onClick={handleFullReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive text-destructive text-sm font-medium active:scale-95 transition-transform">
                <Eraser size={14} /> 초기화
              </button>
            </div>

            {/* 자동저장 표시 설정 */}
            <div className="flex items-center justify-between p-1 pt-2 border-t border-border/30">
              <div>
                <p className="text-sm font-medium">자동저장 파일 표시</p>
                <p className="text-xs text-muted-foreground">목록에서 자동저장 파일을 숨기거나 보여줍니다</p>
              </div>
              <button onClick={() => setShowAutoSaves(!showAutoSaves)} className={`p-2 rounded-lg transition-colors ${showAutoSaves ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {showAutoSaves ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>

            {/* 모든 대화 삭제 */}
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