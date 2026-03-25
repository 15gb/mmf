import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  previewClass?: string;
}

const ImageUploadField = ({ label, value, onChange, hint, previewClass = "w-20 h-20 rounded-full" }: ImageUploadFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("이미지는 2MB 이하만 가능합니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative group">
            <img src={value} alt={label} className={`${previewClass} object-cover`} />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`${previewClass} border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-ring transition-colors`}
          >
            <ImagePlus size={20} />
          </button>
        )}
        {!value && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-primary hover:underline"
          >
            이미지 선택
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
};

export default ImageUploadField;
