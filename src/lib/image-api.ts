import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AppSettings } from "./store";
import { useApiKeyStore } from './api-key-store';

const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[][{}()*#@!]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 1. Pollinations.ai URL 생성 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = sanitizePrompt(prompt);
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  
  return `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&enhance=false&key=${POLLINATIONS_API_KEY || ""}`;
}

/** 2. Gemini 프롬프트 생성 (API 버전을 'v1'으로 강제 고정) */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  const apiKey = getNextKey();
  
  // SDK 초기화
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 💡 [핵심 수정] apiVersion을 'v1'으로 강제 지정하여 404 에러 방지
  const model = genAI.getGenerativeModel(
    { 
      model: "gemini-1.5-flash",
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT" as any, threshold: "BLOCK_NONE" as any },
        { category: "HARM_CATEGORY_HATE_SPEECH" as any, threshold: "BLOCK_NONE" as any },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as any, threshold: "BLOCK_NONE" as any },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT" as any, threshold: "BLOCK_NONE" as any }
      ]
    },
    { apiVersion: "v1" } // 👈 v1beta 대신 정식 버전을 사용하도록 설정
  );

  const systemPrompt = `Expert AI image prompt engineer for "FLUX". Identity: ${settings.charName}. Persona: ${settings.charPersona}. Setting: ${settings.worldSetting}. Style: High-quality anime. Output: ONLY the English prompt, max 60 words.`;
  const history = messages.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");

  try {
    const result = await model.generateContent(`${systemPrompt}\n\nContext:\n${history}\n\nGenerate prompt:`);
    const response = await result.response;
    return response.text().trim();
  } catch (error: any) {
    if (error.message?.includes("429")) {
      rotateKey();
      return generateImagePrompt(messages, settings);
    }
    // 에러 발생 시 상세 메시지 출력
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
  
  onStatusChange("이미지를 그리고 있습니다...");
  const imageUrl = generatePollinationsUrl(prompt);

  return { imageUrl, prompt };
}

export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};