import { AppSettings } from "./store";

const FORGE_BASE_URL = import.meta.env.VITE_FORGE_API_URL || "http://127.0.0.1:7860";

/** ⭐ 빌드 에러의 주범! ImageCard.tsx에서 사용하는 함수입니다. */
export function generatePollinationsUrl(prompt: string): string {
  const clean = prompt.replace(/[][{}()*#@!]/g, "").replace(/\s{2,}/g, " ").trim();
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  return `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&enhance=false`;
}

/** [도우미] 네트워크 요청 타임아웃 (20초) */
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

/** [핵심] Gemini 프롬프트 생성 (키 로테이션 적용) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  
  // 설정에서 가져온 키들을 배열로 변환
  const apiKeys = (settings.geminiApiKey || "")
    .split(',')
    .map(k => k.trim())
    .filter(k => k !== "");

  if (apiKeys.length === 0) {
    throw new Error("설정창에서 Gemini API 키를 먼저 입력해 주세요!");
  }

  const systemPrompt = `Expert Anime Prompt Engineer. Create comma-separated English tags for "AbyssOrangeMix2". 
Character: ${settings.charName} (${settings.charPersona})
Focus on the LAST message's action and mood. Output ONLY tags.`;

  const history = messages.slice(-5).map((m, idx) => {
    const weight = (idx === messages.length - 1) ? " [CURRENT SCENE]" : "";
    return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${weight}`;
  }).join("\n");

  // 키 로테이션 실행 함수
  async function tryRequest(keyIndex: number): Promise<string> {
    if (keyIndex >= apiKeys.length) {
      throw new Error("모든 API 키가 만료되었습니다. 키를 확인해 주세요.");
    }

    const currentKey = apiKeys[keyIndex];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${currentKey}`;

    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nContext:\n${history}\n\nTags:` }] }],
        }),
      });

      if (response.status === 429 || !response.ok) {
        console.warn(`Key ${keyIndex + 1} 초과. 다음 키 시도...`);
        return tryRequest(keyIndex + 1);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "";
    } catch (err) {
      return tryRequest(keyIndex + 1);
    }
  }

  return tryRequest(0);
}

/** [필수] 로컬 Forge 서버와 연동 (그림 그리기) */
async function generateForgeImage(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420"
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: "nsfw, low quality, bad anatomy, text, error, blurry, watermarks",
      steps: 25,
      cfg_scale: 7.5,
      width: 512,
      height: 768,
      sampler_name: "Euler a",
    }),
  }, 60000);

  const data = await response.json();
  return `data:image/png;base64,${data.images[0]}`;
}

/** [필수] 이미지 생성 프로세스 통합 실행 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  try {
    onStatusChange("장면 분석 중 (Gemini)...");
    const prompt = await generateImagePrompt(messages, settings);
    
    onStatusChange("노트북 GPU에서 그리는 중...");
    const imageUrl = await generateForgeImage(prompt);

    return { imageUrl, prompt };
  } catch (err: any) {
    onStatusChange(`에러 발생: ${err.message}`);
    throw err;
  }
}

/** 메시지 인코딩/디코딩 도우미 */
export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};