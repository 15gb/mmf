import { useState } from "react";
import { Search, Loader2, Sparkles } from "lucide-react";
import { searchCharacter } from "@/lib/gemini-api";
import { generatePollinationsUrl } from "@/lib/image-api";
import { toast } from "sonner";

interface CharacterSearchProps {
  onSelect: (data: { name: string; persona: string; greeting: string; avatar: string }) => void;
}

const CharacterSearch = ({ onSelect }: CharacterSearchProps) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    setIsSearching(true);

    try {
      const data = await searchCharacter(query.trim());

      const persona = [data.persona, data.speech_style].filter(Boolean).join("\n\n[말투 및 대사 스타일]\n");
      let avatarUrl = "";
      try {
        const avatarData = JSON.parse(data.avatar);
        const description = avatarData.description || "";
        const urls: string[] = Array.isArray(avatarData.urls) ? avatarData.urls : [];

        const tryUrls = async (list: string[]): Promise<string | null> => {
          let idx = 0;
          return new Promise((resolve) => {
            const next = () => {
              if (idx >= list.length) {
                resolve(null);
                return;
              }
              const testUrl = list[idx++];
              const img = new Image();
              let done = false;
              const cleanup = () => {
                if (img) {
                  img.onload = null;
                  img.onerror = null;
                }
              };
              const timer = setTimeout(() => {
                if (!done) {
                  cleanup();
                  next();
                }
              }, 3000);
              img.onload = () => {
                if (!done) {
                  done = true;
                  clearTimeout(timer);
                  cleanup();
                  resolve(testUrl);
                }
              };
              img.onerror = () => {
                if (!done) {
                  done = true;
                  clearTimeout(timer);
                  cleanup();
                  next();
                }
              };
              img.src = testUrl;
            };
            next();
          });
        };

        const working = urls.length > 0 ? await tryUrls(urls) : null;
        if (working) {
          avatarUrl = working;
        } else {
          const prompt = `masterpiece, high quality, anime style, close up portrait, ${data.name}, ${description || "official art"}`;
          avatarUrl = generatePollinationsUrl(prompt);
        }
      } catch {
        avatarUrl = generatePollinationsUrl(`masterpiece, high quality, anime style, close up portrait, ${data.name}`);
      }

      onSelect({
        name: data.name || "",
        persona: persona || "",
        greeting: data.greeting || "",
        avatar: avatarUrl,
      });
      
      toast.success("캐릭터 정보와 이미지를 성공적으로 불러왔습니다!");
    } catch (e) {
      console.error("Character search error:", e);
      alert("캐릭터 검색에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Sparkles size={14} className="text-primary" />
        캐릭터 검색 (자동 채우기)
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="캐릭터 이름 검색 (예: 나루토, 초코비)"
          className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={!query.trim() || isSearching}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 active:scale-95 transition-transform flex items-center gap-1.5"
        >
          {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          검색
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        만화, 애니, 게임 캐릭터를 검색하면 이름·성격·인사말이 자동으로 채워집니다.
      </p>
    </div>
  );
};

export default CharacterSearch;
