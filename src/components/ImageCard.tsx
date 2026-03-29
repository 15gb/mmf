import { useState } from "react";
import { Download, Eye, EyeOff, RefreshCw, Loader2 } from "lucide-react";
import { generatePollinationsUrl } from "@/lib/image-api";

interface ImageCardProps {
  url: string;
  prompt: string;
}

const ImageCard = ({ url, prompt }: ImageCardProps) => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [imgSrc, setImgSrc] = useState(url);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleDownload = async () => {
    try {
      const resp = await fetch(imgSrc);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `generated-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Fallback: open in new tab
      window.open(imgSrc, "_blank");
    }
  };

  const handleRetry = () => {
    setRetrying(true);
    setError(false);
    setLoading(true);
    setImgSrc(generatePollinationsUrl(prompt));
  };

  return (
    <div className="rounded-xl overflow-hidden bg-muted/50 border border-border max-w-[280px]">
      <div className="relative aspect-square">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 p-4">
            <p className="text-xs text-muted-foreground text-center">이미지를 불러올 수 없습니다</p>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
              다시 시도
            </button>
          </div>
        ) : null}
        <img
          src={imgSrc}
          alt="AI 생성 이미지"
          className={`w-full h-full object-cover transition-opacity duration-300 ${loading || error ? "opacity-0" : "opacity-100"}`}
          onLoad={() => {
            setLoading(false);
            setError(false);
            setRetrying(false);
          }}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
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
