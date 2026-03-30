import { useState } from "react";
import { Download, Eye, EyeOff, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { generatePollinationsUrl } from "@/lib/image-api";
import { useSettings } from "@/lib/store";
import { toast } from "sonner";

interface ImageCardProps {
  url: string;
  prompt: string;
}

const ImageCard = ({ url, prompt }: ImageCardProps) => {
  const { settings } = useSettings();
  const [showPrompt, setShowPrompt] = useState(false);
  const [imgSrc, setImgSrc] = useState(url);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleDownload = async () => {
    try {
      window.open(imgSrc, "_blank");
    } catch (e) {
      console.error("Download error:", e);
    }
  };

  const handleRetry = () => {
    setRetrying(true);
    setError(false);
    setLoading(true);
    const newUrl = generatePollinationsUrl(prompt);
    setImgSrc(newUrl);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
    setRetrying(false);
    toast.error("이미지 생성에 실패했습니다. 캐릭터 기본 이미지를 표시합니다.");
    
    // 에러 발생 시 캐릭터 기본 이미지로 대체 (있는 경우)
    if (settings.charAvatar && !settings.charAvatar.startsWith("data:")) {
      setImgSrc(settings.charAvatar);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden bg-muted/50 border border-border max-w-[280px]">
      <div className="relative aspect-square">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 z-20 gap-2">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-[10px] text-muted-foreground animate-pulse font-medium">캐릭터 이미지를 생성 중입니다...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 p-4 z-20">
            <AlertCircle size={24} className="text-destructive/50" />
            <p className="text-[11px] text-muted-foreground text-center leading-tight">이미지를 불러올 수 없습니다</p>
            <button
              onClick={handleRetry}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity active:scale-95"
            >
              <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
              다시 시도
            </button>
          </div>
        )}
        <img
          src={imgSrc}
          alt={prompt}
          crossOrigin="anonymous"
          className={`w-full h-full object-cover transition-opacity duration-500 ${loading || error ? "opacity-0" : "opacity-100"}`}
          onLoad={() => {
            setLoading(false);
            setError(false);
            setRetrying(false);
          }}
          onError={handleError}
        />
      </div>

      <div className="flex items-center gap-1 p-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Download size={12} />
          다운로드
        </button>
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {showPrompt ? <EyeOff size={12} /> : <Eye size={12} />}
          프롬프트
        </button>
      </div>

      {showPrompt && (
        <div className="px-3 pb-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed break-all">{prompt}</p>
        </div>
      )}
    </div>
  );
};

export default ImageCard;
