import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, LogOut } from "lucide-react";
import { useSettings, type AppSettings } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import ImageUploadField from "@/components/ImageUploadField";
import CharacterSearch from "@/components/CharacterSearch";
import GoogleLoginButton from "@/components/GoogleLoginButton";

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
  const { user, signOut } = useAuth();
  const [form, setForm] = useState<AppSettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const update = (key: keyof AppSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSettings(form);
    toast.success("설정이 저장되었습니다!");
    navigate("/");
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

        <Section title="세계관 설정">
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
      </div>
    </div>
  );
};

export default SettingsPage;
