import type { AppSettings } from "./store";

const PROMPT_GEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-prompt`;

/** Generate a Pollinations.ai image URL from a prompt */
export function generatePollinationsUrl(prompt: string): string {
  const seed = Math.floor(Math.random() * 1000000);
  return `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
}

/** Generate an English prompt from conversation context via edge function */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const resp = await fetch(PROMPT_GEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, settings }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "프롬프트 생성 실패" }));
    throw new Error(err.error || "프롬프트 생성 실패");
  }

  const data = await resp.json();
  return data.prompt;
}

/** Full pipeline: generate prompt -> build Pollinations URL -> preload image */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatus?: (status: string) => void,
): Promise<{ imageUrl: string; prompt: string }> {
  onStatus?.("프롬프트 생성 중...");

  const prompt = await generateImagePrompt(messages, settings);

  onStatus?.("이미지 생성 중...");

  const imageUrl = generatePollinationsUrl(prompt);

  // Preload the image to ensure it's ready
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("이미지 로딩 실패"));
    img.src = imageUrl;
  });

  return { imageUrl, prompt };
}
