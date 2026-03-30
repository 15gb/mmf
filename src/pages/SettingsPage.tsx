import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, LogOut, Trash2, Users, Plus, Trash } from "lucide-react";
import { useSettings, useConversations, type AppSettings, type SupportingCharacter } from "@/lib/store";
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
  const { settings, setSettings } = useSettings();
  const { conversations, deleteConversation } = useConversations();
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

  const addSupportingCharacter = () => {
    const newChar: SupportingCharacter = {
      id: generateUUID(),
      name: "",
      persona: "",
      avatar: "",
    };
    update("supportingCharacters", [...form.supportingCharacters, newChar]);
  };

  const removeSupportingCharacter = (id: string) => {
    update("supportingCharacters", form.supportingCharacters.filter(c => c.id !== id));
  };

  const updateSupportingCharacter = (id: string, field: keyof SupportingCharacter, value: string) => {
    update("supportingCharacters", form.supportingCharacters.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
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
        toast.error("세계관 정보를 생성하지 못했습니다. 다른 키워드로 시도해주세요.");
        return;
      }
      update("worldSetting", data.worldSetting);
      toast.success("세계관이 자동으로 채워졌습니다!");
    } catch (e) {
      console.error("World search error:", e);
      toast.error("세계관 검색에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsWorldSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => navigate("/")}
          className="p-2 -ml-2 rounded-lg text-foreground active:opacity-70"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-foreground">설정</h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform"
        >
          <Save size={14} />
          저장
        </button>
      </header>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        <Section title="계정">
          {user ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">Google 계정으로 로그인됨</p>
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  toast.success("로그아웃 되었습니다");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm active:scale-95 transition-transform"
              >
                <LogOut size={14} />
                로그아웃
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-sm text-muted-foreground">로그인하면 설정과 대화가 클라우드에 저장됩니다</p>
              <GoogleLoginButton />
            </div>
          )}
        </Section>

        <Section title="내 프로필">
          <Field label="이름" value={form.myName} onChange={(v) => update("myName", v)} placeholder="내 이름" />
          <Field label="소개" value={form.myIntro} onChange={(v) => update("myIntro", v)} multiline placeholder="간단한 자기소개" />
        </Section>

        <Section title="AI 캐릭터 프로필">
          <CharacterSearch
            onSelect={(data) => {
              setForm((prev) => ({
                ...prev,
                charName: data.name || prev.charName,
                charPersona: data.persona || prev.charPersona,
                charGreeting: data.greeting || prev.charGreeting,
                charAvatar: data.avatar || prev.charAvatar,
              }));
              toast.success("캐릭터 정보가 자동으로 채워졌습니다!");
            }}
          />
          <ImageUploadField
            label="프로필 이미지"
            value={form.charAvatar}
            onChange={(v) => update("charAvatar", v)}
            hint="2MB 이하 이미지 (원형으로 표시됩니다)"
          />
          <Field label="캐릭터 이름" value={form.charName} onChange={(v) => update("charName", v)} placeholder="AI 캐릭터" />
          <Field
            label="성격 (페르소나)"
            value={form.charPersona}
            onChange={(v) => update("charPersona", v)}
            multiline
            placeholder="캐릭터의 성격과 말투를 설명해주세요"
          />
          <Field
            label="첫 인사말"
            value={form.charGreeting}
            onChange={(v) => update("charGreeting", v)}
            multiline
            placeholder="채팅방에 처음 들어왔을 때 보여줄 인사말"
          />
        </Section>

        <Section title="조연 캐릭터 설정">
          <div className="space-y-4">
            {(form.supportingCharacters ?? []).map((char, index) => (
              <div key={char.id} className="p-4 rounded-lg bg-muted/30 border border-border space-y-4 relative group">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users size={14} className="text-primary" />
                    조연 #{index + 1}
                  </h3>
                  <button
                    onClick={() => removeSupportingCharacter(char.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash size={14} />
                  </button>
                </div>
                
                <ImageUploadField
                  label="조연 이미지"
                  value={char.avatar}
                  onChange={(v) => updateSupportingCharacter(char.id, "avatar", v)}
                  hint="조연의 프로필 이미지"
                />
                
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">이름</label>
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) => updateSupportingCharacter(char.id, "name", e.target.value)}
                      placeholder="조연 이름"
                      className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">성격 및 역할</label>
                    <textarea
                      value={char.persona}
                      onChange={(e) => updateSupportingCharacter(char.id, "persona", e.target.value)}
                      placeholder="조연의 성격, 말투, 대화에서의 역할 등"
                      rows={2}
                      className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            
            <button
              onClick={addSupportingCharacter}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              <span className="text-sm font-medium">새 조연 추가하기</span>
            </button>
          </div>
        </Section>

        <Section title="세계관 설정">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">세계관 검색 (자동 채우기)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={worldQuery}
                onChange={(e) => setWorldQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleWorldSearch()}
                placeholder="세계관/작품/배경 키워드 (예: 나루토 세계관, 사이버펑크 도시, 마법학원)"
                className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleWorldSearch}
                disabled={!worldQuery.trim() || isWorldSearching}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-95 transition-transform flex items-center gap-1.5"
              >
                {isWorldSearching ? <span className="inline-flex items-center gap-1.5"><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-primary-foreground/70 border-t-transparent rounded-full" />검색</span> : "검색"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              키워드를 입력하면 시대·규칙·분위기·주요 장소가 포함된 세계관 설명을 자동으로 생성합니다.
            </p>
          </div>
          <Field
            label="세계관"
            value={form.worldSetting}
            onChange={(v) => update("worldSetting", v)}
            multiline
            placeholder="대화의 배경이 되는 장소, 시대, 상황 등을 적어주세요"
          />
        </Section>

        <Section title="채팅 배경">
          <ImageUploadField
            label="배경 이미지"
            value={form.chatBackground}
            onChange={(v) => update("chatBackground", v)}
            hint="채팅 화면의 배경에 표시됩니다"
            previewClass="w-32 h-20 rounded-lg"
          />
        </Section>

        <Section title="노트 (장기 기억)">
          <Field
            label="노트"
            value={form.note}
            onChange={(v) => update("note", v)}
            multiline
            placeholder="AI가 항상 기억해야 할 내용을 적어주세요. 이 내용은 모든 대화에서 참고됩니다."
          />
          <p className="text-xs text-muted-foreground">
            💡 여기에 적은 내용은 AI에게 보내는 모든 요청에 시스템 프롬프트로 포함됩니다.
          </p>
        </Section>
        <Section title="데이터 관리">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">저장된 대화 삭제</p>
                <p className="text-xs text-muted-foreground">저장된 대화 {conversations.length}개를 모두 삭제합니다</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={conversations.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium active:scale-95 transition-transform disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    삭제
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>저장된 대화를 모두 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>
                      이 작업은 되돌릴 수 없습니다. 저장된 대화 {conversations.length}개가 영구적으로 삭제됩니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        for (const conv of conversations) {
                          await deleteConversation(conv.id);
                        }
                        toast.success("저장된 대화가 모두 삭제되었습니다");
                      }}
                    >
                      삭제
                    </AlertDialogAction>
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
