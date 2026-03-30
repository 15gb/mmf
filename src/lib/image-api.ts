import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AppSettings } from "./store";
import { useApiKeyStore } from './api-key-store';

// .env에서 가져온 Pollinations API 키
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

/** 2. Gemini로 이미지 프롬프트 생성 (💡 공식 SDK 사용으로 에러 완전 방어) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  const apiKey = getNextKey();
  
  // 💡 [변경사항] 구글 공식 SDK 초기화
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 💡 [변경사항] SDK가 주소를 알아서 관리하므로, 모델 이름만 정확히 입력합니다.
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT" as any, threshold: "BLOCK_NONE" as any },
      { category: "HARM_CATEGORY_HATE_SPEECH" as any, threshold: "BLOCK_NONE" as any },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as any, threshold: "BLOCK_NONE" as any },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT" as any, threshold: "BLOCK_NONE" as any }
    ]
  });

  const systemPrompt = `You are an expert AI image prompt engineer for the "FLUX" model.
Consistent identity for "${settings.charName}". 
Context: ${settings.charPersona}
Setting: ${settings.worldSetting}
Visuals: ${settings.charAvatar && settings.charAvatar.length < 500 ? settings.charAvatar : "Anime style character"}.
STYLE: High-quality anime style, masterpiece, 4k.
Output: ONLY the final English prompt text. Max 60 words.`;

  const history = messages.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
  const finalInput = `${systemPrompt}\n\n[Conversation Context]\n${history}\n\nGenerate detailed prompt based on context:`;

  try {
    // 💡 [변경사항] fetch 대신 SDK 함수 호출
    const result = await model.generateContent(finalInput);
    const response = await result.response;
    return response.text().trim() || "";
  } catch (error: any) {
    // 할당량 초과(429) 시 키 교체 로직은 유지
    if (error.message?.includes("429")) {
      rotateKey();
      // 재시도 시 새로고침된 키를 사용하도록 구조 개선
      return generateImagePrompt(messages, settings);
    }
    throw new Error(`Gemini 프롬프트 생성 실패: ${error.message}`);
  }
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