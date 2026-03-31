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

/** [핵심] Gemini 프롬프트 생성 (NSFW 강제 주입 지침) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const apiKeys = (settings.geminiApiKey || "").split(',').map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) throw new Error("Gemini API 키가 필요합니다.");

  // ⭐ 시스템 프롬프트 수정: 상황에 관계없이 무조건 nsfw 태그를 넣도록 지시
  const systemPrompt = `Expert Anime Prompt Engineer for "AbyssOrangeMix2". 
Character: ${settings.charName} (${settings.charPersona})
[CRITICAL RULE]:
1. You MUST ALWAYS start the tags with "nsfw, masterpiece, best quality, erotic, beautiful skin".
2. Analyze the current context and add relevant tags for actions, clothing, and background.
3. Even if the scene is normal, ALWAYS include nsfw-related tags to ensure the style remains consistent.
4. Output ONLY comma-separated English tags. No conversation.`;

  const history = messages.slice(-5).map((m, idx) => {
    const isLast = idx === 4 || idx === messages.length - 1;
    return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${isLast ? " [CURRENT SCENE]" : ""}`;
  }).join("\n");

  async function tryRequest(keyIndex: number): Promise<string> {
    if (keyIndex >= apiKeys.length) throw new Error("모든 API 키가 만료되었거나 할당량이 초과되었습니다.");

    const currentKey = apiKeys[keyIndex];
    // ⭐ 모델을 gemini-3.1-flash-lite-preview로 업데이트 (RPD 500 확보)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${currentKey}`;

    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nContext:\n${history}\n\nTags:` }] }],
          // 🌟 무검열 프롬프트 생성을 위해 안전 필터 해제
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
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

/** [필수] Forge 서버 연동 (Negative Prompt에서 nsfw 완전 제거 및 프롬프트 강제 결합) */
async function generateForgeImage(prompt: string): Promise<string> {
  // ⭐ 프롬프트 앞에 nsfw 태그가 누락되었을 경우를 대비해 한 번 더 강제 결합
  const forcedPrompt = prompt.toLowerCase().includes("nsfw") 
    ? prompt 
    : `nsfw, erotic, ${prompt}`;

  const response = await fetchWithTimeout(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420"
    },
    body: JSON.stringify({
      prompt: `(masterpiece, best quality), ${forcedPrompt}`,
      // ⭐ Negative Prompt에서 nsfw를 완전히 제거하여 출력을 절대 방해하지 않도록 함
      negative_prompt: "low quality, bad anatomy, text, error, blurry, watermarks, (worst quality, low quality:1.4)",
      steps: 25,
      cfg_scale: 7.5,
      width: 512,
      height: 768,
      sampler_name: "Euler a",
    }),
  }, 120000);

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
    onStatusChange("장면 수위 분석 및 NSFW 프롬프트 구성 중...");
    const prompt = await generateImagePrompt(messages, settings);
    
    onStatusChange("Forge SD 가동 중 (무검열 모드)...");
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