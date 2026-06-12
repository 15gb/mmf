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

/** 🌟 회원님 요청 사항: 앱의 메인 모델명 설정은 3.1 원본 그대로 절대 유지 */
const MODEL_NAME = "gemini-3.1-flash-lite";

/** 🌟 구글 서버 에러 우회용: 조연 추출 기능에만 쓰일 공식 안전망 */
const BACKGROUND_SAFE_MODEL = "gemini-1.5-flash";

/** 🌟 모든 카테고리에 대해 검열을 끄는 설정 */
const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

/** 1️⃣ 캐릭터 검색 및 프로필 생성 */
export async function searchCharacter(query: string): Promise<CharacterInfo> {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  const makeRequest = async (key: string): Promise<CharacterInfo> => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) throw new Error("API 키가 없습니다.");

    const systemPrompt = `You are a character database expert for anime, manga, games, and comics. When given a character name, return a JSON object with:
- "name": the character's canonical Korean name (or original name if no Korean name exists)
- "persona": a detailed Korean description of their personality, speech style, and behavior (2-3 sentences). Write it as instructions for an AI to roleplay as this character.
- "speech_style": a detailed Korean description of this character's unique speech patterns, verbal habits, catchphrases, signature expressions, and notable dialogue lines (2-4 sentences). Include specific examples of how they talk, any speech quirks (e.g., ending particles, accent, slang), and 1-2 iconic quotes if available.
- "greeting": a characteristic greeting message in Korean that this character would say, matching their personality and speech style (1-2 sentences). Use the character's actual speech style.
- "avatar_urls": an array of 3-5 strings, each being a publicly accessible DIRECT image URL of the character (ending in .jpg, .png, .webp).
- "visual_description": a detailed English description of the character's appearance (hair, eyes, clothes) for image generation fallback.

Respond ONLY with valid JSON. No markdown, no explanation.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": cleanKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Query: ${query}` }] }],
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
        safetySettings, 
      }),
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
When given a world/setting keyword (anime/game/comic/novel setting or an original idea), return ONLY valid JSON with:
- "name": the canonical Korean name of the world/setting (or original title)
- "summary": a concise Korean summary (1-2 sentences)
- "worldSetting": a Korean description suitable to paste into an AI roleplay system prompt (4-8 lines, newline-separated). Include era, technology/magic level, factions, typical locations, and the vibe.
- "tone": optional, Korean tone keywords (e.g., 다크 판타지, 코미디, 하이틴)
- "keyRules": optional array of 3-6 Korean bullet-like strings describing core rules (magic rules, social rules, hazards)
- "locations": optional array of 3-6 major location names in Korean

Respond ONLY with JSON. No markdown. No explanation.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": cleanKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Query: ${query}` }] }],
        generationConfig: { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 1024 },
        safetySettings,
      }),
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
  const prompt = `
    [Current Story Summary]: ${currentSummary || "None"}
    
    [New Conversation to Add]:
    ${historyText}
    
    [Task]:
    위의 새로운 대화 내용을 바탕으로 '현재까지의 이야기 진행 상황'을 3~5문장 내외의 한국어로 짧게 업데이트해라. 
    중요한 사건, 장소 변경, 캐릭터 간의 관계 변화를 반드시 포함하라. 
    답변은 오직 업데이트된 요약문만 출력하라.
  `;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": cleanKey 
      },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings, 
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text.trim() || currentSummary;
  } catch (e) {
    console.error("요약 실패:", e);
    return currentSummary;
  }
}

/** 4️⃣ 🌟 조연(NPC) 자동 추출 (3.1 모델 우회 강제 적용) */
export async function extractCharactersFromHistory(
  history: string,
  modelName: string, 
  fallbackApiKey: string 
): Promise<{name: string; persona: string}[]> {
  const { getNextKey } = useApiKeyStore.getState();
  const key = (fallbackApiKey || getNextKey()).trim();
  
  if (!key || key === "undefined" || key === "null") {
    throw new Error("API 키가 없습니다.");
  }

  const systemPrompt = `You are a roleplay assistant. Read the recent chat history and extract any NEW supporting characters, NPCs, or extras that were mentioned or briefly interacted with.
DO NOT include the main user or the main character.
Return ONLY a valid JSON array of objects, where each object has:
- "name": The character's name (invent a fitting name if they were only described by their job/role, e.g., "주점 주인").
- "persona": A short 1-2 sentence Korean description of their personality, job, and how they acted in the history.
If no new characters are found, return an empty array [].
Respond ONLY with JSON. No markdown.`;

  // 🌟 구글 서버 400 에러를 원천 차단하기 위해, 추출 작업은 검증된 1.5 모델을 사용합니다.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${BACKGROUND_SAFE_MODEL}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `System Instruction: ${systemPrompt}\n\nRecent History:\n${history}` }] }],
      generationConfig: { temperature: 0.7 },
      safetySettings,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    const errMsg = errData?.error?.message || response.statusText;
    throw new Error(`[${response.status}] ${errMsg}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("NPC JSON parse error:", e, content);
    return [];
  }
}