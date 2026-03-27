import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

const GoogleLoginButton = () => {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) {
        toast.error("로그인에 실패했습니다");
        console.error(error);
      }
    } catch (e) {
      toast.error("로그인 중 오류가 발생했습니다");
      console.error(e);
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
