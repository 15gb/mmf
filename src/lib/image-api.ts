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

/** [핵심] Gemini 프롬프트 생성 (캐릭터 이미지 외형 분석 지침 대폭 강화) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const apiKeys = (settings.geminiApiKey || "").split(',').map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) throw new Error("Gemini API 키가 필요합니다.");

  // ⭐ 시스템 프롬프트 수정: 이미지 분석 및 NSFW 강제 지침
  const systemPrompt = `Expert Anime Prompt Engineer for "AbyssOrangeMix2". 
Character: ${settings.charName} (${settings.charPersona})

[CRITICAL VISUAL TASK]:
1. You are attached a reference image of the character's profile.
2. **You MUST prioritize analyzing basic visual traits from the attached image, especially: HAIR COLOR, hair style, eye color, and unique facial features.**
3. The final prompt must accurately reflect the character's appearance from the reference image. If the image shows 'black hair', the tags must start with 'black hair'.

[GENERATION RULE]:
1. **Always start the tags with "nsfw, masterpiece, best quality, erotic, beautiful skin" followed by the character's exact visual appearance (e.g., 'black hair, blue eyes').**
2. Combine these visual traits with the current chat context, actions, clothing, and background.
3. Output ONLY comma-separated English tags. No conversation.`;

  const history = messages.slice(-5).map((m, idx) => {
    const isLast = idx === 4 || idx === messages.length - 1;
    return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${isLast ? " [CURRENT SCENE]" : ""}`;
  }).join("\n");

  async function tryRequest(keyIndex: number): Promise<string> {
    if (keyIndex >= apiKeys.length) throw new Error("모든 API 키가 만료되었거나 할당량이 초과되었습니다.");

    const currentKey = apiKeys[keyIndex];
    // Gemini 3.1 모델 사용
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${currentKey}`;

    // ⭐ 멀티모달 파트 구성 (텍스트 + 캐릭터 이미지)
    const parts: any[] = [{ text: `${systemPrompt}\n\nContext:\n${history}\n\nTags:` }];

    // 프로필 이미지가 있는 경우 Gemini에게 시각 분석용 데이터로 전달
    if (settings.charAvatar && settings.charAvatar.startsWith("data:image")) {
      const [mimeInfo, base64Data] = settings.charAvatar.split(",");
      const mimeType = mimeInfo.match(/:(.*?);/)?.[1] || "image/png";
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data,
        },
      });
    }

    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
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

/** [필수] Forge 서버 연동 (Negative Prompt 최적화 및 강제 결합) */
async function generateForgeImage(prompt: string): Promise<string> {
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
      // ⭐ 성인용 출력을 절대 방해하지 않도록 Negative에서 nsfw 단어 완전 삭제
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
    onStatusChange("캐릭터 외형(머리카락 등) 및 수위 분석 중...");
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