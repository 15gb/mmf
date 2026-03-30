빌드 에러의 원인은 아주 명확합니다! 아까 제가 키 로테이션(여러 개의 키 사용) 기능을 넣은 image-api.ts 코드를 드릴 때, ImageCard.tsx에서 가져다 쓰는 generatePollinationsUrl이라는 함수를 실수로 빠뜨리고 드렸기 때문입니다.

Vite가 빌드 중에 **"어? ImageCard는 이 함수를 쓰고 싶은데 image-api.ts에는 없네?"**라며 발을 걸고 넘어진 상황이에요.

이 함수를 포함해서 에러 없이 빌드되고, 키 로테이션까지 완벽하게 작동하는 최종 image-api.ts 코드를 다시 드릴게요. 이걸로 덮어쓰시면 해결됩니다!

🛠️ src/lib/image-api.ts (전체 수정 코드 - 복사해서 덮어쓰세요)
TypeScript
import { AppSettings } from "./store";

const FORGE_BASE_URL = import.meta.env.VITE_FORGE_API_URL || "http://127.0.0.1:7860";

/** ⭐ 빌드 에러 해결을 위해 꼭 필요한 함수 (Pollinations URL 생성) */
export function generatePollinationsUrl(prompt: string): string {
  const clean = prompt.replace(/[][{}()*#@!]/g, "").replace(/\s{2,}/g, " ").trim();
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  // Pollinations API 키가 필요 없는 모델 기준 주소입니다.
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

/** [핵심] Gemini 프롬프트 생성 (키 로테이션 적용) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  
  // 반점으로 구분된 키들을 배열로 만듭니다.
  const apiKeys = (settings.geminiApiKey || "")
    .split(',')
    .map(k => k.trim())
    .filter(k => k !== "");

  if (apiKeys.length === 0) {
    throw new Error("설정에서 Gemini API 키를 먼저 입력해 주세요!");
  }

  const systemPrompt = `Expert Anime Prompt Engineer. Create comma-separated English tags for image generation.
Character: ${settings.charName} (${settings.charPersona})
Focus on the LAST message's action and mood. Output ONLY tags. Max 50 words.`;

  const history = messages.slice(-5).map((m, idx) => {
    const weight = (idx === messages.length - 1) ? " [CURRENT SCENE]" : "";
    return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${weight}`;
  }).join("\n");

  // 여러 개의 키를 순서대로 시도하는 함수
  async function tryRequest(keyIndex: number): Promise<string> {
    if (keyIndex >= apiKeys.length) {
      throw new Error("모든 API 키의 사용량이 초과되었거나 유효하지 않습니다.");
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
        console.warn(`Key ${keyIndex + 1} 문제 발생. 다음 키로 시도합니다...`);
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

/** 로컬 Forge 연동 */
async function generateForgeImage(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420"
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: "nsfw, low quality, bad anatomy, text, error, blurry, realistic, 3d",
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

/** 통합 실행 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  try {
    onStatusChange("장면 분석 중 (Gemini)...");
    const prompt = await generateImagePrompt(messages, settings);
    
    onStatusChange("노트북에서 그리는 중...");
    const imageUrl = await generateForgeImage(prompt);

    return { imageUrl, prompt };
  } catch (err: any) {
    onStatusChange(`에러: ${err.message}`);
    throw err;
  }
}

export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};