import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, LogOut, Trash2, Users, Plus, Trash, Key, Eye, EyeOff } from "lucide-react";
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

const Field = ({ label, value, onChange, multiline, placeholder }: any) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-foreground">{label}</label>
    {multiline ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
    ) : (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
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

  useEffect(() => { setForm(settings); }, [settings]);

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
      update("worldSetting", data.worldSetting);
      toast.success("세계관이 자동으로 생성되었습니다!");
    } catch (e) {
      toast.error("세계관 생성 실패");
    } finally { setIsWorldSearching(false); }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg text-foreground"><ArrowLeft size={20} /></button>
        <h1 className="font-semibold text-foreground">설정</h1>
        <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform">
          <Save size={14} /> 저장
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 text-foreground">
        <Section title="계정">
          {user ? (
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">{user.email}</p><p className="text-xs text-muted-foreground">로그인 중</p></div>
              <button onClick={() => { signOut(); toast.success("로그아웃 되었습니다"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm"><LogOut size={14} /> 로그아웃</button>
            </div>
          ) : <div className="py-2 flex flex-col items-center gap-2"><GoogleLoginButton /></div>}
        </Section>

        <Section title="내 프로필">
          <Field label="이름" value={form.myName} onChange={(v:any) => update("myName", v)} />
          <Field label="소개" value={form.myIntro} onChange={(v:any) => update("myIntro", v)} multiline />
        </Section>

        <Section title="AI 캐릭터 프로필">
          <CharacterSearch onSelect={(data:any) => setForm(prev => ({...prev, charName: data.name||prev.charName, charPersona: data.persona||prev.charPersona, charGreeting: data.greeting||prev.charGreeting, charAvatar: data.avatar||prev.charAvatar }))} />
          <ImageUploadField label="프로필 이미지" value={form.charAvatar} onChange={(v:any) => update("charAvatar", v)} />
          <Field label="캐릭터 이름" value={form.charName} onChange={(v:any) => update("charName", v)} />
          <Field label="성격 (페르소나)" value={form.charPersona} onChange={(v:any) => update("charPersona", v)} multiline />
          <Field label="첫 인사말" value={form.charGreeting} onChange={(v:any) => update("charGreeting", v)} multiline />
        </Section>

        <Section title="세계관 및 노트">
           <div className="space-y-2 mb-4">
            <label className="text-sm font-medium">세계관 검색</label>
            <div className="flex gap-2">
              <input type="text" value={worldQuery} onChange={(e) => setWorldQuery(e.target.value)} className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm focus:outline-none" placeholder="키워드 입력" />
              <button onClick={handleWorldSearch} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm">{isWorldSearching ? "..." : "생성"}</button>
            </div>
          </div>
          <Field label="세계관" value={form.worldSetting} onChange={(v:any) => update("worldSetting", v)} multiline />
          <Field label="노트" value={form.note} onChange={(v:any) => update("note", v)} multiline />

          {/* ⭐ API 키 입력창 */}
          <div className="mt-6 pt-5 border-t border-border/50 space-y-2">
            <label className="text-sm font-medium flex items-center gap-2"><Key size={16} className="text-primary" /> Gemini API Key</label>
            <input type="password" value={form.geminiApiKey || ""} onChange={(e) => update("geminiApiKey", e.target.value)} placeholder="AIzaSy..." className="w-full rounded-lg bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-[10px] text-muted-foreground italic leading-relaxed">* 모바일 이미지 생성 시 필수입니다. 키가 여러 개면 반점(,)으로 구분하세요.</p>
          </div>
        </Section>

        <Section title="데이터 관리">
          <div className="space-y-4">
            {/* ⭐ 자동저장 파일 숨기기 토글 */}
            <div className="flex items-center justify-between p-1">
              <div>
                <p className="text-sm font-medium">자동저장 파일 표시</p>
                <p className="text-xs text-muted-foreground">목록에서 자동저장 파일을 숨기거나 보여줍니다</p>
              </div>
              <button 
                onClick={() => setShowAutoSaves(!showAutoSaves)}
                className={`p-2 rounded-lg transition-colors ${showAutoSaves ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
              >
                {showAutoSaves ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <div>
                <p className="text-sm font-medium">모든 대화 삭제</p>
                <p className="text-xs text-muted-foreground">저장된 {allConversations.length}개의 대화를 모두 삭제합니다</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button disabled={allConversations.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm disabled:opacity-40"><Trash2 size={14} /> 삭제</button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>정말 삭제할까요?</AlertDialogTitle><AlertDialogDescription>모든 대화 기록이 영구적으로 사라집니다.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive" onClick={async () => { for (const c of allConversations) await deleteConversation(c.id); toast.success("삭제되었습니다"); }}>삭제</AlertDialogAction>
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