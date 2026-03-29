import type { AppSettings } from "./store";

const PROMPT_GEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-prompt`;

/** Sanitize prompt: remove newlines, special chars, collapse to single line */
function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[\r\n]+/g, ", ")
    .replace(/["']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Generate a Pollinations.ai image URL from a prompt */
export function generatePollinationsUrl(prompt: string, useFlux = true): string {
  const clean = sanitizePrompt(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  let url = `https://pollinations.ai/p/${encodeURIComponent(clean)}?width=1024&height=1024&seed=${seed}`;
  if (useFlux) {
    url += `&model=flux&nologo=true`;
  }
  return url;
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

/** Preload image with retry: on failure, retry with new seed; on second failure try without flux */
function preloadImage(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    function tryLoad() {
      attempt++;
      // 1st & 2nd attempt: with flux. 3rd attempt: without flux.
      const useFlux = attempt <= 2;
      const url = generatePollinationsUrl(prompt, useFlux);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(url);
      img.onerror = () => {
        if (attempt < 3) {
          console.warn(`Image load attempt ${attempt} failed, retrying...`);
          tryLoad();
        } else {
          reject(new Error("이미지 로딩 실패 (3회 시도)"));
        }
      };
      img.src = url;
    }

    tryLoad();
  });
}

/** Full pipeline: generate prompt -> build Pollinations URL -> preload image with retries */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatus?: (status: string) => void,
): Promise<{ imageUrl: string; prompt: string }> {
  onStatus?.("프롬프트 생성 중...");

  const prompt = await generateImagePrompt(messages, settings);

  onStatus?.("이미지 생성 중...");

  const imageUrl = await preloadImage(prompt);

  return { imageUrl, prompt };
}
