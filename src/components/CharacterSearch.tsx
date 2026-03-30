import { useState } from "react";
import { Search, Loader2, Sparkles } from "lucide-react";
import { searchCharacter } from "@/lib/gemini-api";
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
        const isRealPhotoLike = (u: string) => {
          let host = "";
          try { host = new URL(u).hostname.toLowerCase(); } catch {}
          if (/instagram|facebook|tiktok|pinterest|tumblr|flickr|imgur|500px/.test(host)) return true;
          if (/\bcosplay\b|\bphoto\b|\bphotograph\b|\brealistic\b|\blive[- ]?action\b/i.test(u)) return true;
          return false;
        };
        const filteredUrls = urls.filter((u) => !isRealPhotoLike(u));

        const toProxy = (u: string) => `/api/image-proxy?url=${encodeURIComponent(u)}`;
        const tryUrls = async (list: string[]): Promise<string | null> => {
          let idx = 0;
          return new Promise((resolve) => {
            const next = () => {
              if (idx >= list.length) {
                resolve(null);
                return;
              }
              const directUrl = list[idx++];
              const testUrl = toProxy(directUrl);
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

        const candidates = filteredUrls.length > 0 ? filteredUrls : urls;
        const working = candidates.length > 0 ? await tryUrls(candidates) : null;
        if (working) {
          avatarUrl = working; // already proxied
        } else {
          // Fallback to Wikipedia thumbnail (character-only heuristic) → then Lexica (SD search) → then Waifu.pics
          const queryWikiByTitle = async (host: "en" | "ko", title: string): Promise<string | null> => {
            const apiUrl = `https://${host}.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=512&titles=${encodeURIComponent(title)}`;
            const jsonResp = await fetch(`/api/json-proxy?url=${encodeURIComponent(apiUrl)}`);
            if (!jsonResp.ok) return null;
            const json = await jsonResp.json();
            const pages = json?.query?.pages || {};
            const pageId = Object.keys(pages)[0];
            const page = pageId ? pages[pageId] : null;
            if (!page || !page.thumbnail?.source) return null;
            const t = page.title?.toLowerCase() || "";
            // Heuristic: avoid series pages
            if (/\b만화\b|\bmanga\b|\banime\b|\bseries\b|\bfilm\b|\btv\b|\bfranchise\b/.test(t)) return null;
            return toProxy(page.thumbnail.source);
          };
          const queryWikiBySearch = async (host: "en" | "ko", q: string): Promise<string | null> => {
            const apiUrl = `https://${host}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json`;
            const jsonResp = await fetch(`/api/json-proxy?url=${encodeURIComponent(apiUrl)}`);
            if (!jsonResp.ok) return null;
            const json = await jsonResp.json();
            const first = json?.query?.search?.[0]?.title as string | undefined;
            if (!first) return null;
            return queryWikiByTitle(host, first);
          };
          const queryLexica = async (q: string): Promise<string | null> => {
            const apiUrl = `https://lexica.art/api/v1/search?q=${encodeURIComponent(q)}`;
            const jsonResp = await fetch(`/api/json-proxy?url=${encodeURIComponent(apiUrl)}`);
            if (!jsonResp.ok) return null;
            const json = await jsonResp.json();
            const img = json?.images?.[0];
            const url = img?.src || img?.srcSmall || null;
            return url ? toProxy(url) : null;
          };
          const queryWaifu = async (): Promise<string | null> => {
            const apiUrl = `https://api.waifu.pics/sfw/waifu`;
            const jsonResp = await fetch(`/api/json-proxy?url=${encodeURIComponent(apiUrl)}`);
            if (!jsonResp.ok) return null;
            const json = await jsonResp.json();
            const url = json?.url || null;
            return url ? toProxy(url) : null;
          };
          const candidates: string[] = [];
          const baseName = (data.name || "").trim();
          if (baseName) {
            candidates.push(baseName);
            candidates.push(`${baseName} (캐릭터)`);
            candidates.push(`${baseName} 캐릭터`);
          }
          // Special-case common mononyms
          if (/나루토/i.test(baseName)) {
            candidates.push("우즈마키 나루토");
            candidates.push("Naruto Uzumaki");
          }
          // Try exact title first (ko -> en)
          let found: string | null = null;
          for (const t of candidates) {
            found = (await queryWikiByTitle("ko", t)) || (await queryWikiByTitle("en", t));
            if (found) break;
          }
          // Try search API with character keywords
          if (!found) {
            const searchQs = [
              `${baseName} 캐릭터`,
              `${baseName} (character)`,
              baseName,
            ].filter(Boolean);
            for (const sq of searchQs) {
              found = (await queryWikiBySearch("ko", sq)) || (await queryWikiBySearch("en", sq));
              if (found) break;
            }
          }
          // Try Lexica (Stable Diffusion gallery) as non-Pollinations AI source
          if (!found && baseName) {
            found = (await queryLexica(`${baseName} anime character portrait, illustration, high quality -cosplay -photo -photograph -realistic -live action`)) || null;
          }
          // Last resort: generic anime image provider
          if (!found) {
            found = await queryWaifu();
          }
          avatarUrl = found || "";
          if (!avatarUrl) {
            console.warn("No usable character image found via Wikipedia for:", baseName);
          }
        }
      } catch {
        // On any exception, attempt Wikipedia (en → ko)
        const toProxy = (u: string) => `/api/image-proxy?url=${encodeURIComponent(u)}`;
        const tryWiki = async () => {
          for (const host of ["en", "ko"] as const) {
            try {
              const apiUrl = `https://${host}.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=512&titles=${encodeURIComponent(data.name)}`;
              const jsonResp = await fetch(`/api/json-proxy?url=${encodeURIComponent(apiUrl)}`);
              if (!jsonResp.ok) continue;
              const json = await jsonResp.json();
              const pages = json?.query?.pages || {};
              const pageId = Object.keys(pages)[0];
              const thumb = pageId ? pages[pageId]?.thumbnail?.source : null;
              if (thumb) return toProxy(thumb);
            } catch {}
          }
          return "";
        };
        avatarUrl = await tryWiki();
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
