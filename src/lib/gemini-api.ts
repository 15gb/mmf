import { useApiKeyStore } from './api-key-store';

export interface CharacterInfo {
  name: string;
  persona: string;
  speech_style?: string;
  greeting: string;
  avatar: string;
}

export interface WorldInfo {
  name: string;
  summary: string;
  worldSetting: string;
  keyRules?: string[];
  locations?: string[];
  tone?: string;
}

/** 🌟 모델 설정: 3.1 모델명 유지 */
const MODEL_NAME = "gemini-3.1-flash-lite";

/** 🌟 데이터 추출용 안전 모델 (3.1 에러 방지 우회망) */
const BACKGROUND_SAFE_MODEL = "gemini-1.5-flash";

const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

/** 🌟 헤더 기반 인증 함수 (주소창에 키를 노출하지 않아 보안상 안전합니다) */
async function secureFetch(endpoint: string, apiKey: string, body: any) {
  const cleanKey = apiKey.trim();
  // 디버깅용: 어떤 키가 나가는지 확인 (터미널창 확인)
  console.log("Sending API Key to Google:", cleanKey.substring(0, 8) + "...");
  
  return await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cleanKey
    },
    body: JSON.stringify(body),
  });
}

/** 1️⃣ 캐릭터 검색 */
export async function searchCharacter(query: string): Promise<CharacterInfo> {
  const { getNextKey } = useApiKeyStore.getState();
  const apiKey = getNextKey();
  if (!apiKey) throw new Error("API 키가 없습니다.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
  const systemPrompt = `You are a character database expert. Return JSON: name, persona, speech_style, greeting, avatar_urls(array), visual_description. No markdown.`;

  const response = await secureFetch(endpoint, apiKey, {
    contents: [{ parts: [{ text: `System: ${systemPrompt}\nQuery: ${query}` }] }],
    generationConfig: { temperature: 0.7 },
    safetySettings,
  });

  if (!response.ok) throw new Error(`[${response.status}] API 호출 실패`);
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try {
    const parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return {
      name: parsed.name || query,
      persona: parsed.persona || "",
      speech_style: parsed.speech_style || "",
      greeting: parsed.greeting || "",
      avatar: JSON.stringify({ urls: parsed.avatar_urls || [], description: parsed.visual_description || "" })
    };
  } catch {
    return { name: query, persona: "", greeting: "", avatar: "{}", speech_style: "" };
  }
}

/** 2️⃣ 세계관 자동 생성 */
export async function searchWorld(query: string): Promise<WorldInfo> {
  const { getNextKey } = useApiKeyStore.getState();
  const apiKey = getNextKey();
  if (!apiKey) throw new Error("API 키가 없습니다.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
  const response = await secureFetch(endpoint, apiKey, {
    contents: [{ parts: [{ text: `Worldbuilding JSON for: ${query}` }] }],
    generationConfig: { temperature: 0.7 },
    safetySettings,
  });

  if (!response.ok) throw new Error(`[${response.status}] API 호출 실패`);
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try {
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return { name: query, summary: "", worldSetting: "" };
  }
}

/** 3️⃣ 대화 기록 요약 */
export async function summarizeHistory(messages: any[], summary: string, apiKey: string): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
  const response = await secureFetch(endpoint, apiKey, {
    contents: [{ parts: [{ text: `Update summary: ${summary}\nHistory: ${JSON.stringify(messages)}` }] }],
    safetySettings,
  });
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || summary;
}

/** 4️⃣ 🌟 조연(NPC) 자동 추출 */
export async function extractCharactersFromHistory(
  history: string,
  modelName: string, 
  fallbackApiKey: string 
): Promise<{name: string; persona: string}[]> {
  const { getNextKey } = useApiKeyStore.getState();
  const key = fallbackApiKey || getNextKey();
  if (!key) throw new Error("API 키가 설정되지 않았습니다.");

  // 🌟 추출 전용 안전 모델 사용
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${BACKGROUND_SAFE_MODEL}:generateContent`;
  
  const response = await secureFetch(endpoint, key, {
    contents: [{ parts: [{ text: `Extract new NPC characters from this chat history. Return JSON array [{name, persona}].\n\nHistory: ${history}` }] }],
    generationConfig: { temperature: 0.5 },
    safetySettings,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData?.error?.message || "추출 서버 에러";
    console.error("추출 에러 상세:", errData);
    throw new Error(`[${response.status}] ${errMsg}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  try {
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  } catch {
    return [];
  }
}