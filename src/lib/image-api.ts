import { useApiKeyStore } from './api-key-store';
import type { AppSettings } from "./store";

const FORGE_BASE_URL = import.meta.env.VITE_FORGE_API_URL || "http://127.0.0.1:7860";
const POLLINATIONS_API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY || "";

/** [필수 1] 에러 방지용 */
export function generatePollinationsUrl(prompt: string): string {
  const clean = prompt.replace(/[][{}()*#@!]/g, "").replace(/\s{2,}/g, " ").trim();
  const encodedPrompt = encodeURIComponent(clean);
  const seed = Math.floor(Math.random() * 1000000).toString();
  return `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&seed=${seed}&enhance=false&key=${POLLINATIONS_API_KEY}`;
}

/** [필수 2] 캐릭터 프로필(외형) 추출 */
function getVisualDescription(settings: AppSettings): string {
  try {
    // 프로필 설정에 저장된 외형 묘사 데이터를 가져옵니다.
    const avatarData = JSON.parse(settings.charAvatar);
    return avatarData.description || settings.charName;
  } catch {
    return settings.charAvatar || settings.charName;
  }
}

/** [핵심] 맥락 분석 및 프롬프트 생성 함수 */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<string> => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`;
    const visualRef = getVisualDescription(settings);
    
    // ⭐ Gemini를 위한 초정밀 지침 (맥락 파악 + 가중치 부여)
    const systemPrompt = `You are a Scene Analyst & Image Prompt Engineer for "AbyssOrangeMix2".
Your goal is to capture the EXACT CURRENT MOMENT of the conversation.

[STEP 1: Character Appearance (The Foundation)]
- Base visual: ${visualRef}
- Character Identity: ${settings.charPersona}
- You MUST maintain this character's consistency (hair, eyes, specific clothes).

[STEP 2: Context Analysis (The Scene)]
- You will be given the last 5 messages of the conversation.
- Carefully observe the transition of the scene.
- CRITICAL: The VERY LAST MESSAGE has the HIGHEST WEIGHT. It represents the immediate action, expression, and emotion to be drawn.

[STEP 3: Output Format]
- Output ONLY English tags (comma-separated).
- Always include: masterpiece, best quality, (abyssorangemix:1.2), highly detailed, vibrant.
- Focus on: [Character], [Current Action], [Specific Expression], [Current Background/Atmosphere].
- Max 60 words. No chat or explanations.`;

    // 💡 최근 5개의 대화만 정교하게 슬라이싱하여 순서대로 전달
    const contextHistory = messages.slice(-5).map((m, idx) => {
      const weightLabel = (idx === 4) ? " [CRITICAL: CURRENT SCENE]" : "";
      return `${m.role === "assistant" ? "AI" : "User"}: ${m.content}${weightLabel}`;
    }).join("\n");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n[CONVERSATION CONTEXT (Last 5 messages)]\n${contextHistory}\n\nGenerate Final Prompt Tags:` }] }],
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

/** [필수 3] 로컬 Forge 연동 */
async function generateForgeImage(prompt: string): Promise<string> {
  const response = await fetch(`${FORGE_BASE_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420"
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: "nsfw, (low quality, worst quality:1.4), bad anatomy, bad hands, text, watermark, error, blurry",
      steps: 28,
      cfg_scale: 8.0,
      width: 512,
      height: 768,
      sampler_name: "DPM++ 2M Karras",
      enable_hr: false, 
    }),
  });

  if (!response.ok) throw new Error("Forge 서버 연결 실패");
  const data = await response.json();
  return `data:image/png;base64,${data.images[0]}`;
}

/** [필수 4] 통합 실행 */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatusChange: (status: string) => void
): Promise<{ imageUrl: string; prompt: string }> {
  onStatusChange(`맥락 분석 및 화풍 구성 중...`);
  const prompt = await generateImagePrompt(messages, settings);
  
  onStatusChange("노트북 GPU로 장면 그리는 중...");
  const imageUrl = await generateForgeImage(prompt);

  return { imageUrl, prompt };
}

export const encodeImageMessage = (url: string, prompt: string) => `![${prompt}](${url})`;
export const decodeImageMessage = (content: string): { url: string; prompt: string } | null => {
  const match = content.match(/^!\[(.*)\]\((.*)\)$/);
  return match ? { prompt: match[1], url: match[2] } : null;
};