import { AppSettings } from "./store";

const FORGE_BASE_URL = import.meta.env.VITE_FORGE_API_URL || "http://127.0.0.1:7860";

/** ImageCard.tsx에서 사용하는 함수 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = prompt.replace(/[][{}()*#@!]/g, "").replace(/\s{2,}/g, " ").trim();
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  return `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&enhance=false`;
}

/** [도우미] 네트워크 요청 타임아웃 */
const fetchWithTimeout = async (resource: string, options: any = {}, timeout = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

/** [핵심] Gemini 프롬프트 생성 (NSFW 맥락 분석 지침 추가) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const apiKeys = (settings.geminiApiKey || "").split(',').map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) throw new Error("Gemini API 키가 필요합니다.");

  // ⭐ 시스템 프롬프트 수정: 맥락에 따라 NSFW 태그를 생성하도록 지시
  const systemPrompt = `Expert Anime Prompt Engineer for "AbyssOrangeMix2". 
Character: ${settings.charName} (${settings.charPersona})
Current Scene Analysis Rule:
1. Focus on the LAST message's action, clothing, and mood.
2. If the conversation context is sexually suggestive, erotic, or involves nudity, you MUST include tags like 'nsfw, suggestive, erotic, beautiful skin'.
3. If it's a normal scene, focus on high-quality anime tags.
4. Output ONLY comma-separated English tags.`;

  const history = messages.slice(-5).map((m, idx) => {
    const isLast = idx === 4 || idx === messages.length - 1;
    return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${isLast ? " [CURRENT SCENE]" : ""}`;
  }).join("\n");

  async function tryRequest(keyIndex: number): Promise<string> {
    if (keyIndex >= apiKeys.length) throw new Error("모든 API 키 만료.");

    const currentKey = apiKeys[keyIndex];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${currentKey}`;

    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nContext:\n${history}\n\nTags:` }] }],
          // ⚠️ 주의: gemini-api.ts에서 safetySettings를 BLOCK_NONE으로 설정해야 프롬프트 생성이 거부되지 않습니다.
        }),
      });

      if (response.status === 429 || !response.ok) return tryRequest(keyIndex + 1);

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "";
    } catch {
      return tryRequest(keyIndex + 1);
    }
  }

  return tryRequest(0);
}

/** [필수] Forge 서버 연동 (Negative Prompt에서 nsfw 제거) */
async function generateForgeImage(prompt: string): Promise<string> {
  // ⭐ 프롬프트에 nsfw 관련 단어가 있는지 확인
  const isNsfwIncluded = /nsfw|erotic|sexy|naked|lewd/i.test(prompt);

  const response = await fetchWithTimeout(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420"
    },
    body: JSON.stringify({
      prompt: `(masterpiece, best quality), ${prompt}`,
      // ⭐ 만약 Gemini가 NSFW 태그를 줬다면, Negative에서 nsfw를 제외하여 출력을 허용함
      negative_prompt: `${isNsfwIncluded ? "" : "nsfw, "}low quality, bad anatomy, text, error, blurry, watermarks, (worst quality, low quality:1.4)`,
      steps: 25,
      cfg_scale: 7.5,
      width: 512,
      height: 768,
      sampler_name: "Euler a",
    }),
  }, 120000); // 생성 시간이 길어질 수 있으므로 타임아웃 연장

  const data = await response.json();
  if (!data.images || data.images.length === 0) throw new Error("이미지 생성 결과가 없습니다.");
  return `data:image/png;base64,${data.images[0]}`;
}

/** 이미지 생성 프로세스 통합 실행 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  try {
    onStatusChange("장면 수위 및 상황 분석 중...");
    const prompt = await generateImagePrompt(messages, settings);
    
    onStatusChange("GPU 가동 중 (Forge SD)...");
    const imageUrl = await generateForgeImage(prompt);

    return { imageUrl, prompt };
  } catch (err: any) {
    onStatusChange(`오류: ${err.message}`);
    throw err;
  }
}

export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};