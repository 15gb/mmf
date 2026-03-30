import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error during auth callback:", error.message);
          setErrorMsg(error.message);
          toast.error(`로그인 오류: ${error.message}`);
          
          // 모바일 디버깅을 위해 상세 에러 알림
          if (window.location.hostname !== "localhost") {
            alert(`로그인 오류 발생: ${error.message}\n현재 주소: ${window.location.href}`);
          }
        } else if (!data.session) {
          console.warn("No session found in callback");
          // 세션이 없을 경우 잠시 대기 후 다시 확인 (OAuth 리다이렉트 지연 대비)
          setTimeout(async () => {
            const { data: retryData } = await supabase.auth.getSession();
            if (retryData.session) {
              navigate("/", { replace: true });
            } else {
              setErrorMsg("세션을 찾을 수 없습니다.");
              toast.error("로그인 세션을 불러오지 못했습니다.");
            }
          }, 1500);
          return;
        }
        
        // 성공 시 메인으로 이동
        navigate("/", { replace: true });
      } catch (e: any) {
        console.error("Unexpected error during auth callback:", e);
        setErrorMsg(e.message || "알 수 없는 오류가 발생했습니다.");
      }
    };

    handleAuthCallback();
  }, [navigate]);

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
        <p className="text-destructive mb-4 font-semibold">로그인 중 문제가 발생했습니다.</p>
        <p className="text-sm text-muted-foreground mb-6">{errorMsg}</p>
        <button 
          onClick={() => navigate("/")}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          메인으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground animate-pulse">로그인 세션을 확인 중입니다...</p>
    </div>
  );
};

export default AuthCallback;
