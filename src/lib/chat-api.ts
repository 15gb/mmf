import { useApiKeyStore } from './api-key-store';

export interface StreamChatOptions {
  message: string;
  settings?: any;
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Gemini 다중 키 풀을 추출하는 헬퍼 함수
 * 기본 geminiApiKey(쉼표/줄바꿈 구분) + extraApiKeys 내의 Gemini 키들을 모두 병합
 */
export const getGeminiKeyPool = (settings?: any): string[] => {
  const keys: string[] = [];
  
  let baseKeyString = settings?.geminiApiKey || "";
  let extraKeys: any[] = settings?.extraApiKeys || [];

  if (!settings) {
    try {
      const stored = localStorage.getItem("app-settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        baseKeyString = parsed.geminiApiKey || "";
        extraKeys = parsed.extraApiKeys || [];
      }
    } catch (e) {
      console.warn("로컬 설정 파싱 실패", e);
    }
  }

  // 1. 기본 geminiApiKey에서 쉼표(,) 및 공백/줄바꿈 기준 분리
  if (baseKeyString) {
    baseKeyString.split(/[\n,]+/).forEach((k: string) => {
      const trimmed = k.trim();
      if (trimmed) keys.push(trimmed);
    });
  }

  // 2. extraApiKeys 중 이름에 'gemini'가 들어간 키들 병합
  extraKeys.forEach((k: any) => {
    if (k.name && k.name.toLowerCase().includes("gemini") && k.value) {
      k.value.split(/[\n,]+/).forEach((v: string) => {
        const trimmed = v.trim();
        if (trimmed) keys.push(trimmed);
      });
    }
  });

  // 3. Zustand api-key-store에 있는 키도 병합
  try {
    const storeKey = useApiKeyStore.getState().getNextKey();
    if (storeKey && !keys.includes(storeKey)) keys.push(storeKey);
  } catch (e) {}

  // 중복 제거
  return Array.from(new Set(keys));
};

export const streamChat = async (options: StreamChatOptions) => {
  let selectedModel = options.settings?.selectedModel || "gemini-3.5-flash";
  let extraApiKeys: any[] = options.settings?.extraApiKeys || [];

  if (!options.settings) {
    try {
      const storedSettings = localStorage.getItem("app-settings");
      if (storedSettings) {
        const settings = JSON.parse(storedSettings);
        if (settings.selectedModel) selectedModel = settings.selectedModel;
        if (settings.extraApiKeys) extraApiKeys = settings.extraApiKeys;
      }
    } catch (e) {
      console.warn("모델 설정을 불러오는데 실패했습니다.", e);
    }
  }

  // 모델 분류 판별
  const isLocal = selectedModel.includes("local") || selectedModel.includes("qwen") || selectedModel.includes("lmstudio");
  const isGemini = !isLocal && selectedModel.includes("gemini");
  const isGroq = !isLocal && selectedModel.includes("llama");
  const isCohere = !isLocal && selectedModel.includes("command");
  const isGitHub = !isLocal && (selectedModel.includes("gpt") || selectedModel.includes("openai"));
  const isOpenRouter = !isLocal && (selectedModel.includes(":free") || selectedModel.includes("mythomist") || selectedModel.includes("openrouter") || selectedModel.includes("nvidia") || selectedModel.includes("gemma"));

  // API 키 할당
  let geminiPool: string[] = [];
  let currentApiKey = "";

  if (isGemini) {
    geminiPool = getGeminiKeyPool(options.settings);
    currentApiKey = geminiPool[0] || "";
  } else if (isGroq) {
    const keyObj = extraApiKeys.find(k => k.name.toLowerCase().includes("groq") || k.name.toLowerCase().includes("llama"));
    currentApiKey = keyObj?.value || "";
  } else if (isCohere) {
    const keyObj = extraApiKeys.find(k => k.name.toLowerCase().includes("cohere") || k.name.toLowerCase().includes("command"));
    currentApiKey = keyObj?.value || "";
  } else if (isGitHub) {
    const keyObj = extraApiKeys.find(k => k.name.toLowerCase().includes("github") || k.name.toLowerCase().includes("gpt"));
    currentApiKey = keyObj?.value || "";
  } else if (isOpenRouter) {
    const keyObj = extraApiKeys.find(k => k.name.toLowerCase().includes("openrouter"));
    currentApiKey = keyObj?.value || "";
  }

  // 로컬 모델이 아닌데 키가 없는 경우 차단
  if (!isLocal && !currentApiKey) {
    options.onError(`[${selectedModel}] 모델에 대한 유효한 API 키가 없습니다. 설정에서 키를 등록해주세요.`);
    return;
  }

  let geminiKeyIndex = 0;

  const makeRequest = async (key: string): Promise<void> => {
    let url = "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: any = {};

    // 1. LM Studio 로컬 구동
    if (isLocal) {
      url = "http://localhost:1234/v1/chat/completions";
      headers["Authorization"] = "Bearer not-needed";
      body = {
        model: selectedModel,
        messages: [{ role: "user", content: options.message }],
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 2048,
        stream: true,
      };
    }
    // 2. Google Gemini 공식 API
    else if (isGemini) {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${key}`;
      body = {
        contents: [{ parts: [{ text: options.message }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      };
    }
    // 3. Groq
    else if (isGroq) {
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${key}`;
      body = {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: options.message }],
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 2048,
        stream: true,
      };
    }
    // 4. Cohere
    else if (isCohere) {
      url = "https://api.cohere.ai/v1/chat";
      headers["Authorization"] = `Bearer ${key}`;
      headers["Accept"] = "application/stream+json";
      body = {
        model: "command-r-08-2024",
        message: options.message,
        temperature: 0.9,
        p: 0.95,
        stream: true,
      };
    }
    // 5. GitHub Models
    else if (isGitHub) {
      url = "https://models.github.ai/inference/chat/completions";
      headers["Authorization"] = `Bearer ${key}`;
      body = {
        model: selectedModel,
        messages: [{ role: "user", content: options.message }],
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 2048,
        stream: true,
      };
    }
    // 6. OpenRouter
    else if (isOpenRouter) {
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = `Bearer ${key}`;
      headers["HTTP-Referer"] = window.location.origin;
      headers["X-Title"] = "Memory Mate Chat";
      body = {
        model: selectedModel,
        messages: [{ role: "user", content: options.message }],
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 2048,
        stream: true,
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });

      // Gemini 할당량 초과(429) 또는 인증 에러 시 다음 대체 키로 즉시 전환
      if (isGemini && (response.status === 429 || response.status === 403 || response.status === 400)) {
        console.warn(`[Gemini API] 키(${key.slice(0, 8)}...) 실패(Status: ${response.status}). 다음 키로 자동 전환합니다.`);
        geminiKeyIndex++;
        if (geminiKeyIndex < geminiPool.length) {
          const nextKey = geminiPool[geminiKeyIndex];
          return makeRequest(nextKey);
        } else {
          throw new Error("등록된 모든 Gemini API 키의 할당량을 소진했거나 유효하지 않습니다.");
        }
      }

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        // 응답 텍스트에 할당량 소진 단어가 있는 경우도 대비
        if (isGemini && (errorText.includes("RESOURCE_EXHAUSTED") || errorText.includes("quota"))) {
          geminiKeyIndex++;
          if (geminiKeyIndex < geminiPool.length) {
            return makeRequest(geminiPool[geminiKeyIndex]);
          }
        }
        throw new Error(`통신 오류 (${response.status}): ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) continue;

          try {
            let delta = "";

            if (isGemini && line.startsWith("data: ")) {
              const json = JSON.parse(line.substring(6));
              delta = json.candidates?.[0]?.content?.parts?.[0]?.text;
            } else if ((isLocal || isGroq || isGitHub || isOpenRouter) && line.startsWith("data: ")) {
              if (line.includes("[DONE]")) break;
              const json = JSON.parse(line.substring(6));
              delta = json.choices?.[0]?.delta?.content;
            } else if (isCohere) {
              const json = JSON.parse(line);
              if (json.event_type === "text-generation") delta = json.text;
            }

            if (delta) {
              options.onDelta(delta);
            }
          } catch (e) {}
        }
      }
      options.onDone();
    } catch (error: any) {
      // 로컬 LM Studio가 켜져 있지 않을 때의 안내
      if (isLocal && (error.message?.includes("Failed to fetch") || error.name === "TypeError")) {
        options.onError("LM Studio 로컬 서버에 연결할 수 없습니다. LM Studio에서 [Start Server]가 켜져 있는지 확인하세요.");
        return;
      }
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  await makeRequest(currentApiKey);
};