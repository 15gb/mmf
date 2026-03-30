import type { AppSettings } from "./store";
import { useApiKeyStore } from './api-key-store';

// .env 또는 Vercel 환경변수에서 API 키를 가져옵니다.
const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[][{}()*#@!]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 1. Pollinations.ai V2 공식 주소 및 파라미터 적용 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = sanitizePrompt(prompt);
  // URL 경로에 포함될 수 있도록 인코딩 (공백 등을 %20 등으로 변환)
  const encodedPrompt = encodeURIComponent(clean);
  
  // 사용자님이 주신 공식 예시 주소 구조: https://gen.pollinations.ai/image/{prompt}
  const baseUrl = `https://gen.pollinations.ai/image/${encodedPrompt}`;
  
  const params = new URLSearchParams({
    model: "flux",         // 무료 모델인 flux 사용
    width: "1024",
    height: "1024",
    seed: Math.floor(Math.random() * 1000000).toString(), // 매번 다른 그림을 위해 랜덤 시드 사용
    enhance: "false",
    key: POLLINATIONS_API_KEY || "" // 내 API Key 적용
  });

  return `${baseUrl}?${params.toString()}`;
}

/** 2. 대화 맥락을 파악해 Gemini로 이미지 프롬프트 생성 */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<string> => {
    // 503 에러나 과부하 방지를 위해 flash-lite 모델 사용
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    
    const systemPrompt = `You are an expert AI image prompt engineer.
Your task is to generate a high-quality English prompt for the "FLUX" model.

STRICT INSTRUCTIONS:
1. SUBJECT: Maintain consistent visual identity of "${settings.charName}".
2. CHARACTER PROFILE: ${settings.charPersona}
3. WORLD SETTING: ${settings.worldSetting}
4. VISUAL REFERENCE: Use this description: ${settings.charAvatar && settings.charAvatar.length < 500 ? settings.charAvatar : "Anime style character"}.
5. STYLE: High-quality anime style, masterpiece, 4k, detailed background.
6. OUTPUT: Return ONLY the final English prompt text. Max 60 words.`;

    const history = messages.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[Context]\n${history}\n\nGenerate a detailed prompt:`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: combinedPrompt }] }],
        // 검열 설정을 최하로 낮춤 (BLOCK_NONE)
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
      if (nextKey === key) throw new Error("모든 API 키의 할당량을 소진했습니다.");
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
  if (!prompt) throw new Error("이미지 프롬프트를 생성하지 못했습니다.");

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