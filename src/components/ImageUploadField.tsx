import React, { useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

export default function ImageUploadField({ label, value, onChange, hint }: ImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 5MB 용량 제한
    if (file.size > 5 * 1024 * 1024) {
      toast.error("5MB 이하의 이미지만 업로드 가능합니다.");
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("이미지 업로드 중...");

    try {
      const fileExt = file.name.split('.').pop();
      // 🌟 utils 파일 없이 고유한 파일명을 생성 (빌드 에러 해결)
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${fileName}`;

      // Supabase Storage의 'images' 버킷에 업로드
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 공개 URL 가져오기
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      onChange(publicUrl);
      toast.success("이미지 업로드 완료!", { id: toastId });
    } catch (error: any) {
      console.error("업로드 에러:", error);
      toast.error(error.message || "이미지 업로드에 실패했습니다.", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-xl border border-border bg-muted overflow-hidden shrink-0 flex flex-col items-center justify-center">
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="text-muted-foreground" size={24} />
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <label className="flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg cursor-pointer hover:bg-primary/90 transition-colors active:scale-95 disabled:opacity-50">
            {isUploading ? "업로드 중..." : "기기에서 사진 선택"}
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              className="hidden" 
              disabled={isUploading}
            />
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="또는 이미지 인터넷 주소(URL) 직접 입력"
            className="w-full rounded-md bg-background px-3 py-1.5 text-xs border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}