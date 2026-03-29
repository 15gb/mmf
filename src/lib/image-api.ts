import type { AppSettings } from "./store";

const PROMPT_GEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-prompt`;
const POLLINATIONS_API_KEY = "sk_UHjSVdoCaZpsyXS5N77bYrQt3j4BqaYO";

/** Sanitize prompt: remove newlines, special chars, collapse to single line */
function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[\r\n]+/g, ", ")
    .replace(/["']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Generate a Pollinations.ai image URL from a prompt */
export function generatePollinationsUrl(prompt: string): string {
  const clean = sanitizePrompt(prompt);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?api_key=${POLLINATIONS_API_KEY}&width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&model=flux&nologo=true`;
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

/** Preload image with retry */
function preloadImage(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    function tryLoad() {
      attempt++;
      const url = generatePollinationsUrl(prompt);

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
  onStatus?.("문맥을 분석하여 이미지를 그리고 있습니다...");

  const prompt = await generateImagePrompt(messages, settings);

  onStatus?.("이미지 생성 중...");

  const imageUrl = await preloadImage(prompt);

  return { imageUrl, prompt };
}

/** Helper: encode image data into a special message format */
export function encodeImageMessage(url: string, prompt: string): string {
  return `__IMG__${JSON.stringify({ url, prompt })}__IMG__`;
}

/** Helper: decode image message, returns null if not an image message */
export function decodeImageMessage(content: string): { url: string; prompt: string } | null {
  const match = content.match(/^__IMG__(.+)__IMG__$/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
