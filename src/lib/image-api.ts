import type { AppSettings } from "./store";

const FORGE_BASE_URL = import.meta.env.VITE_FORGE_API_URL || "http://127.0.0.1:7860";

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
  
  // 1. 반점으로 구분된 키들을 배열로 만듭니다. (공백 제거 포함)
  const apiKeys = settings.geminiApiKey
    .split(',')
    .map(k => k.trim())
    .filter(k => k !== "");

  if (apiKeys.length === 0) {
    throw new Error("설정창에서 Gemini API 키를 입력해 주세요!");
  }

  const systemPrompt = `Expert Anime Prompt Engineer. Create comma-separated English tags.
Character: ${settings.charName} (${settings.charPersona})
Focus on the LAST message's action and mood. Output ONLY tags. Max 50 words.`;

  const history = messages.slice(-5).map((m, idx) => {
    const weight = (idx === 4) ? " [CURRENT SCENE]" : "";
    return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${weight}`;
  }).join("\n");

  // 2. 여러 개의 키를 순서대로 시도하는 함수
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

      // 만약 할당량 초과(429) 에러가 나면 다음 키로 시도
      if (response.status === 429) {
        console.warn(`Key ${keyIndex + 1} 초과됨. 다음 키로 시도합니다...`);
        return tryRequest(keyIndex + 1);
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Gemini API Error:", errorData);
        // 키 자체가 잘못된 경우(400)도 다음 키 시도
        return tryRequest(keyIndex + 1);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "";

    } catch (err) {
      console.error(`Key ${keyIndex + 1} 요청 실패:`, err);
      return tryRequest(keyIndex + 1);
    }
  }

  return tryRequest(0); // 0번 키부터 시작!
}

/** [필수] 로컬 Forge 연동 */
async function generateForgeImage(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420"
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: "nsfw, low quality, bad anatomy, text, error, blurry",
      steps: 25,
      cfg_scale: 7.5,
      width: 512,
      height: 768,
      sampler_name: "Euler a",
    }),
  }, 60000); // 그림 그리기는 1분 대기

  const data = await response.json();
  if (!data.images || data.images.length === 0) throw new Error("이미지 생성 결과가 없습니다.");
  return `data:image/png;base64,${data.images[0]}`;
}

/** [필수] 통합 실행 함수 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  try {
    onStatusChange("문맥 분석 중 (Gemini)...");
    const prompt = await generateImagePrompt(messages, settings);
    
    onStatusChange("노트북 GPU로 그리는 중...");
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