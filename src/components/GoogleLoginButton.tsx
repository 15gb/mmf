import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

const GoogleLoginButton = () => {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    
    try {
      // window.location.origin을 사용하여 접속한 환경(PC/모바일)에 맞춰 유연하게 설정
      // Supabase 설정의 Site URL 또는 Redirect URLs에 이 주소가 등록되어 있어야 합니다.
      // 중요: 와일드카드 매칭을 위해 정확한 콜백 경로를 명시해야 합니다.
      const redirectUrl = `${window.location.origin}/auth/callback`;
      
      console.log("Attempting login with redirectUrl:", redirectUrl);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          // 모바일 브라우저 안정성을 위해 리다이렉트 방식 강제
          skipBrowserRedirect: false,
        },
      });
      if (error) {
        toast.error("로그인에 실패했습니다");
        console.error(error);
        alert(`로그인 요청 에러: ${error.message}\nRedirect: ${redirectUrl}`);
      }
    } catch (e: any) {
      toast.error("로그인 중 오류가 발생했습니다");
      console.error(e);
      alert(`런타임 에러: ${e.message || "알 수 없는 오류"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
    >
      <LogIn size={16} />
      {loading ? "로그인 중..." : "Google로 로그인"}
    </button>
  );
};

export default GoogleLoginButton;
