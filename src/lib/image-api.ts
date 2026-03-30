import { useApiKeyStore } from './api-key-store';
import type { AppSettings } from "./store";

// .env 또는 Vercel 환경변수에서 가져온 Pollinations API 키
const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[][{}()*#@!]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 1. Pollinations.ai 이미지 URL 생성 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = sanitizePrompt(prompt);
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  
  // 사용자님이 제공해주신 Pollinations V2 공식 주소 형식
  return `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&enhance=false&key=${POLLINATIONS_API_KEY || ""}`;
}

/** 2. Gemini로 이미지 프롬프트 생성 (작동 확인된 채팅 API와 동일한 모델/주소 사용) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<string> => {
    // 💡 [핵심 수정] 채팅 API와 동일한 v1beta 주소 및 gemini-flash-lite-latest 모델 사용
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`;
    
    const systemPrompt = `You are an expert AI image prompt engineer for the "FLUX" model.
Consistent identity for "${settings.charName}". 
Character Context: ${settings.charPersona}
World Setting: ${settings.worldSetting}
Visuals: ${settings.charAvatar && settings.charAvatar.length < 500 ? settings.charAvatar : "Anime style character"}.
Output: ONLY the English prompt. Max 60 words. No explanations.`;

    const history = messages.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[Conversation History]\n${history}\n\nGenerate high-quality English prompt:`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: combinedPrompt }] }],
        // 검열 설정을 가장 낮게 적용
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 150,
        },
      }),
    });

    // 할당량 초과 시 키 교체 (채팅 API의 로직과 동일)
    if (response.status === 429) {
      rotateKey();
      const newApiKey = useApiKeyStore.getState().getNextKey();
      if (newApiKey === key) throw new Error("모든 API 키의 할당량을 소진했습니다.");
      return makeRequest(newApiKey);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "";
  };

  return makeRequest(apiKey);
}

/** 3. 최종 이미지 생성 프로세스 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  onStatusChange("캐릭터 특징 분석 중...");
  const prompt = await generateImagePrompt(messages, settings);
  if (!prompt) throw new Error("이미지 프롬프트를 생성하지 못했습니다.");

  onStatusChange("이미지를 생성하고 있습니다...");
  const imageUrl = generatePollinationsUrl(prompt);

  return { imageUrl, prompt };
}

export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};