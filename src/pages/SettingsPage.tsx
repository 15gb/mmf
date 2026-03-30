import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, LogOut, Trash2, Users, Plus, Trash, Key, Eye, EyeOff, ImageIcon } from "lucide-react";
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
  const { conversations, allConversations, deleteConversation, showAutoSaves, setShowAutoSaves } = useConversations();
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

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg text-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-foreground">설정</h1>
        <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform">
          <Save size={14} /> 저장
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
              <button onClick={async () => { await signOut(); toast.success("로그아웃 되었습니다"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-sm">
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
          <Field label="소개" value={form.myIntro} onChange={(v) => update("myIntro", v)} multiline placeholder="자기소개" />
        </Section>

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
          {/* 캐릭터 프로필 이미지 업로드 */}
          <ImageUploadField label="캐릭터 프로필 이미지" value={form.charAvatar} onChange={(v) => update("charAvatar", v)} hint="캐릭터의 얼굴로 표시됩니다" />
          <Field label="캐릭터 이름" value={form.charName} onChange={(v) => update("charName", v)} placeholder="AI 캐릭터" />
          <Field label="성격 (페르소나)" value={form.charPersona} onChange={(v) => update("charPersona", v)} multiline placeholder="성격과 말투" />
          <Field label="첫 인사말" value={form.charGreeting} onChange={(v) => update("charGreeting", v)} multiline placeholder="첫 인사말" />
        </Section>

        <Section title="채팅방 꾸미기">
          {/* ⭐ [요청 반영] 배경 이미지 업로드 필드 추가 */}
          <ImageUploadField 
            label="채팅 배경 이미지" 
            value={form.chatBackground} 
            onChange={(v) => update("chatBackground", v)} 
            hint="채팅방 전체 배경으로 적용됩니다" 
          />
        </Section>

        <Section title="세계관 및 노트">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">세계관 검색</label>
            <div className="flex gap-2">
              <input type="text" value={worldQuery} onChange={(e) => setWorldQuery(e.target.value)} placeholder="키워드 입력" className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={handleWorldSearch} disabled={isWorldSearching} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                {isWorldSearching ? "..." : "검색"}
              </button>
            </div>
          </div>
          <Field label="세계관" value={form.worldSetting} onChange={(v) => update("worldSetting", v)} multiline placeholder="시대상, 배경 등" />
          <Field label="노트 (장기 기억)" value={form.note} onChange={(v) => update("note", v)} multiline placeholder="AI가 기억해야 할 중요 정보" />

          {/* API Key Section */}
          <div className="mt-6 pt-5 border-t border-border/50 space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Key size={16} className="text-primary" /> Gemini API Key
            </label>
            <input type="password" value={form.geminiApiKey || ""} onChange={(e) => update("geminiApiKey", e.target.value)} placeholder="AIzaSy..." className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-[10px] text-muted-foreground italic px-1">* 쉼표(,)로 구분하여 최대 3개까지 입력 가능합니다.</p>
          </div>
        </Section>

        <Section title="데이터 관리">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-1">
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
                <p className="text-sm font-medium text-foreground">모든 대화 삭제</p>
                <p className="text-xs text-muted-foreground">저장된 {allConversations.length}개의 대화를 모두 삭제합니다</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button disabled={allConversations.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium active:scale-95 transition-transform disabled:opacity-40">
                    <Trash2 size={14} /> 삭제
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>모든 대화를 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>이 작업은 되돌릴 수 없으며 모든 기록이 삭제됩니다.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive" onClick={async () => { for (const c of allConversations) await deleteConversation(c.id); toast.success("삭제 완료"); }}>삭제</AlertDialogAction>
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