import type { AppSettings } from "./store";
import { useApiKeyStore } from './api-key-store';

const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[][{}()*#@!]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 1. Pollinations.ai V2 공식 주소 적용 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = sanitizePrompt(prompt);
  const encodedPrompt = encodeURIComponent(clean);
  
  const baseUrl = `https://gen.pollinations.ai/image/${encodedPrompt}`;
  
  const params = new URLSearchParams({
    model: "flux",
    width: "1024",
    height: "1024",
    seed: Math.floor(Math.random() * 1000000).toString(),
    enhance: "false",
    key: POLLINATIONS_API_KEY || ""
  });

  return `${baseUrl}?${params.toString()}`;
}

/** 2. Gemini로 이미지 프롬프트 생성 (안정적인 v1 주소와 모델명 사용) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<string> => {
    // 💡 수정됨: v1beta 대신 더 안정적인 v1 주소를 사용하고, 모델명을 'gemini-1.5-flash'로 고정합니다.
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`;
    
    const systemPrompt = `You are an expert AI image prompt engineer for the "FLUX" model.
Consistent identity for "${settings.charName}". 
Context: ${settings.charPersona}
Setting: ${settings.worldSetting}
Visuals: ${settings.charAvatar && settings.charAvatar.length < 500 ? settings.charAvatar : "Anime style character"}.
Output: ONLY the English prompt. Max 60 words.`;

    const history = messages.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[History]\n${history}\n\nDetailed prompt:`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: combinedPrompt }] }],
        // v1/v1beta 공용 안전 설정
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: { temperature: 0.8, maxOutputTokens: 150 },
      }),
    });

    if (resp.status === 429) {
      rotateKey();
      const nextKey = useApiKeyStore.getState().getNextKey();
      if (nextKey === key) throw new Error("모든 API 키 할당량 소진");
      return makeRequest(nextKey);
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `프롬프트 생성 실패: ${resp.status}`);
    }

    const data = await resp.json();
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
  if (!prompt) throw new Error("프롬프트 생성 실패");

  onStatusChange("이미지를 그리고 있습니다...");
  const imageUrl = generatePollinationsUrl(prompt);

  return { imageUrl, prompt };
}

export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  if (match) {
    return { prompt: match[1], url: match[2] };
  }
  return null;
};