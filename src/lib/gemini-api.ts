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

/** 🌟 모델 설정: 회원님의 요청대로 3.1 모델 유지 */
const MODEL_NAME = "gemini-3.1-flash-lite";

/** 🌟 추출 전용 안전 모델 (400 에러 발생 시 우회용) */
const BACKGROUND_SAFE_MODEL = "gemini-1.5-flash";

const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

/** 🌟 🚨 키 추적기 포함 통신 함수 (이게 로그를 찍어줍니다) */
async function fetchWithDebug(endpoint: string, apiKey: string, body: any) {
  const cleanKey = String(apiKey || "").trim();
  
  console.log("--- [DEBUG] API 통신 시작 ---");
  console.log("Target URL:", endpoint);
  console.log("API Key (첫 5자리):", cleanKey.substring(0, 5) + "...");
  console.log("Payload:", JSON.stringify(body));
  
  const url = `${endpoint}?key=${encodeURIComponent(cleanKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("🚨 [DEBUG] 서버 응답 에러:", errorData);
  }
  
  return response;
}

/** 1️⃣ 캐릭터 검색 및 프로필 생성 */
export async function searchCharacter(query: string): Promise<CharacterInfo> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<CharacterInfo> => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) throw new Error("API 키가 없습니다.");

    const systemPrompt = `You are a character database expert for anime, manga, games, and comics. When given a character name, return a JSON object with:
- "name": the character's canonical Korean name (or original name if no Korean name exists)
- "persona": a detailed Korean description of their personality, speech style, and behavior (2-3 sentences).
- "speech_style": a detailed Korean description of this character's unique speech patterns, verbal habits, catchphrases, signature expressions, and notable dialogue lines (2-4 sentences).
- "greeting": a characteristic greeting message in Korean that this character would say.
- "avatar_urls": an array of 3-5 strings, each being a publicly accessible DIRECT image URL of the character.
- "visual_description": a detailed English description of the character's appearance.

Respond ONLY with valid JSON. No markdown, no explanation.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

    const response = await fetchWithDebug(endpoint, cleanKey, {
      contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Query: ${query}` }] }],
      generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
      safetySettings, 
    });

    if (response.status === 429) {
      rotateKey();
      return makeRequest(useApiKeyStore.getState().getNextKey());
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
       return {
         name: parsed.name || query,
         persona: parsed.persona || "",
         speech_style: parsed.speech_style || "",
         greeting: parsed.greeting || "",
         avatar: JSON.stringify({ urls: parsed.avatar_urls || [], description: parsed.visual_description || "" }), 
       };
    } catch (e) {
      return { name: query, persona: "", greeting: "", avatar: JSON.stringify({ urls: [], description: "" }), speech_style: "" };
    }
  };

  return makeRequest(apiKey);
}

/** 2️⃣ 세계관 자동 생성 */
export async function searchWorld(query: string): Promise<WorldInfo> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<WorldInfo> => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) throw new Error("API 키가 없습니다.");

    const systemPrompt = `You are a worldbuilding encyclopedia and RPG scenario designer.
When given a world/setting keyword, return ONLY valid JSON with:
- "name", "summary", "worldSetting", "tone", "keyRules", "locations".
Respond ONLY with JSON. No markdown. No explanation.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

    const response = await fetchWithDebug(endpoint, cleanKey, {
      contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Query: ${query}` }] }],
      generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
      safetySettings,
    });

    if (response.status === 429) {
      rotateKey();
      return makeRequest(useApiKeyStore.getState().getNextKey());
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        name: parsed.name || query,
        summary: parsed.summary || "",
        worldSetting: parsed.worldSetting || "",
        tone: parsed.tone || undefined,
        keyRules: Array.isArray(parsed.keyRules) ? parsed.keyRules : undefined,
        locations: Array.isArray(parsed.locations) ? parsed.locations : undefined,
      };
    } catch {
      return { name: query, summary: "", worldSetting: "" };
    }
  };

  return makeRequest(apiKey);
}

/** 3️⃣ 대화 기록 요약 */
export async function summarizeHistory(
  messages: { role: string; content: string }[], 
  currentSummary: string, 
  apiKey: string
): Promise<string> {
  const cleanKey = String(apiKey || "").trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;
  
  const historyText = messages.map(m => `${m.role}: ${m.content}`).join("\n");
  const prompt = `[Current Story Summary]: ${currentSummary || "None"}\n[New Conversation]:\n${historyText}\n[Task]: Update summary. Output ONLY summary.`;

  try {
    const response = await fetchWithDebug(endpoint, cleanKey, {
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings, 
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || currentSummary;
  } catch (e) {
    console.error("요약 실패:", e);
    return currentSummary;
  }
}

/** 4️⃣ 🌟 조연(NPC) 자동 추출 (400 에러 방어 로직) */
export async function extractCharactersFromHistory(
  history: string,
  modelName: string, 
  fallbackApiKey: string 
): Promise<{name: string; persona: string}[]> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let initialKey = fallbackApiKey || getNextKey();

  const makeRequest = async (key: string, isRetry: boolean = false): Promise<{name: string; persona: string}[]> => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) throw new Error("API 키가 없습니다.");

    const systemPrompt = `Extract NEW supporting characters (NPCs) from the history. Return JSON array [{name, persona}]. No markdown.`;

    // 🌟 3.1에서 400에러(존재하지 않는 모델 에러) 발생 시 1.5로 우회
    const targetModel = isRetry ? BACKGROUND_SAFE_MODEL : MODEL_NAME;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`;

    const response = await fetchWithDebug(endpoint, cleanKey, {
      contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nHistory: ${history}` }] }],
      generationConfig: { temperature: 0.7 },
      safetySettings,
    });

    if (response.status === 429) {
      rotateKey();
      return makeRequest(useApiKeyStore.getState().getNextKey(), isRetry);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      // 🚨 400 에러면 무조건 1.5로 재시도
      if (!isRetry && response.status === 400) {
        console.warn(`[DEBUG] ${targetModel} 호출 실패, 1.5-flash로 우회 재시도...`);
        return makeRequest(key, true);
      }
      throw new Error(`[${response.status}] ${errData?.error?.message || "추출 서버 에러"}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    try {
      return JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return [];
    }
  };

  return makeRequest(initialKey);
}