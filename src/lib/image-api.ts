import { useApiKeyStore } from './api-key-store';
import type { AppSettings } from "./store";

const FORGE_BASE_URL = "http://127.0.0.1:7860";
const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY || "";

/** [필수 1] ImageCard.tsx 에러 방지용 함수 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = prompt.replace(/[][{}()*#@!]/g, "").replace(/\s{2,}/g, " ").trim();
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  return `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&enhance=false&key=${POLLINATIONS_API_KEY}`;
}

/** [도우미] 캐릭터 설정 추출 */
function getVisualDescription(settings: AppSettings): string {
  try {
    const avatarData = JSON.parse(settings.charAvatar);
    return avatarData.description || settings.charName;
  } catch {
    return settings.charAvatar || settings.charName;
  }
}

/** [필수 2] Gemini 프롬프트 생성 */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<string> => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`;
    const visualRef = getVisualDescription(settings);
    
    const systemPrompt = `Masterpiece anime prompt engineer. 
Character: ${settings.charName} (${visualRef})
Style: (abyssorangemix:1.2), masterpiece, best quality, highres, vibrant colors.
Task: Describe the scene in English tags. No explanations.`;

    const history = messages.slice(-5).map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nChat Context:\n${history}\n\nGenerate Tags:` }] }],
        safetySettings: [{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }],
      }),
    });

    if (response.status === 429) {
      rotateKey();
      return makeRequest(useApiKeyStore.getState().getNextKey());
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "";
  };

  return makeRequest(apiKey);
}

/** [필수 3] 로컬 Forge 연동 (Hires.fix 끔) */
async function generateForgeImage(prompt: string): Promise<string> {
  const response = await fetch(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: "nsfw, (low quality, worst quality:1.4), bad anatomy, bad hands, text",
      steps: 25,
      cfg_scale: 7.5,
      width: 512,
      height: 768,
      sampler_name: "Euler a",
      enable_hr: false, // 에러 방지를 위해 꺼둠
    }),
  });

  if (!response.ok) throw new Error("Forge 서버 연결 실패");
  const data = await response.json();
  return `data:image/png;base64,${data.images[0]}`;
}

/** [필수 4] 최종 이미지 생성 통합 함수 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  onStatusChange("이미지 구상 중...");
  const prompt = await generateImagePrompt(messages, settings);
  
  onStatusChange("내 노트북 GPU로 그리는 중...");
  const imageUrl = await generateForgeImage(prompt);

  return { imageUrl, prompt };
}

/** [필수 5] 메시지 인코딩/디코딩 */
export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};