import type { AppSettings } from "./store";
import { useApiKeyStore } from './api-key-store';

const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[][{}()*#@!]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Generate a Pollinations.ai V2 image URL from a prompt */
export function generatePollinationsUrl(prompt: string): string {
  const clean = sanitizePrompt(prompt);
  const params = new URLSearchParams({
    prompt: clean,
    width: "1024",
    height: "1024",
    seed: "0",
    enhance: "false"
  });
  return `/api/pollinations-image?${params.toString()}`;
}

/** Generate an English prompt from conversation context via Gemini */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<string> => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`;
    
    // 캐릭터 프로필 및 맥락 반영을 위한 강화된 시스템 프롬프트
    const systemPrompt = `You are an expert AI image prompt engineer.
Your task is to generate a high-quality English prompt for the "FLUX" model.

STRICT INSTRUCTIONS:
1. SUBJECT: Maintain consistent visual identity of "${settings.charName}".
2. CHARACTER PROFILE: ${settings.charPersona}
3. WORLD SETTING: ${settings.worldSetting}
4. VISUAL REFERENCE: Use this description for the character's appearance: ${settings.charAvatar && settings.charAvatar.length < 500 ? settings.charAvatar : "Anime style character"}.
5. CURRENT CONTEXT: Capture the mood, action, and environment from the recent conversation.
6. STYLE: High-quality anime style, masterpiece, 4k, detailed background.
7. OUTPUT: Return ONLY the final English prompt text. Max 60 words. No "Negative Prompt", no explanation.

Example Input: "Smile at me"
Example Output: "Masterpiece anime style, close up of ${settings.charName} with a warm gentle smile, eyes sparkling, ${settings.worldSetting} background, high quality, 4k"`;

    const history = messages.map(m => `${m.role === "assistant" ? "AI" : "User"}: ${m.content}`).join("\n");
    const combinedPrompt = `${systemPrompt}\n\n[Recent Conversation History]\n${history}\n\nGenerate a detailed prompt based on the latest context:`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: combinedPrompt }] }],
        generationConfig: { temperature: 0.8, topK: 40, topP: 0.95, maxOutputTokens: 150 },
      }),
    });

    if (resp.status === 429) {
      rotateKey();
      apiKey = useApiKeyStore.getState().getNextKey();
      if (apiKey === key) throw new Error("모든 API 키의 할당량을 소진했습니다.");
      return makeRequest(apiKey);
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `이미지 프롬프트 생성 실패: ${resp.status}`);
    }

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "";
  };

  return makeRequest(apiKey);
}

export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  onStatusChange("캐릭터 특징 및 맥락 분석 중...");
  const prompt = await generateImagePrompt(messages, settings);
  if (!prompt) throw new Error("이미지 프롬프트를 생성하지 못했습니다.");

  onStatusChange("캐릭터 이미지를 생성 중입니다...");
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
