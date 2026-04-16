import { useApiKeyStore } from './api-key-store';

export interface StreamChatOptions {
  message: string;
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export const streamChat = async (options: StreamChatOptions) => {
  // 🌟 설정 저장소(localStorage)에서 선택된 모델과 추가된 API 키 목록을 가져옵니다.
  let selectedModel = "gemini-3.1-flash-lite"; // 기본값
  let extraApiKeys: any[] = [];
  
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

  // 🌟 모델 종류 판별
  const isGemini = selectedModel.includes("gemini");
  const isGroq = selectedModel.includes("llama");
  const isCohere = selectedModel.includes("command");

  // 🌟 모델에 맞는 API 키를 동적으로 탐색하여 할당합니다.
  let currentApiKey = "";

  if (isGemini) {
    currentApiKey = useApiKeyStore.getState().getNextKey();
  } else if (isGroq) {
    const keyObj = extraApiKeys.find(k => k.name.toLowerCase().includes("groq") || k.name.toLowerCase().includes("llama"));
    currentApiKey = keyObj?.value || "";
  } else if (isCohere) {
    const keyObj = extraApiKeys.find(k => k.name.toLowerCase().includes("cohere") || k.name.toLowerCase().includes("command"));
    currentApiKey = keyObj?.value || "";
  }

  // 키를 찾지 못했다면 바로 에러를 띄우고 종료합니다.
  if (!currentApiKey) {
    options.onError(`[${selectedModel}] 모델에 대한 API 키를 찾을 수 없습니다. 설정 화면에서 키 이름(Groq, Cohere 등)을 정확히 입력했는지 확인해주세요.`);
    return;
  }

  const makeRequest = async (key: string): Promise<void> => {
    let url = "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: any = {};

    // ==========================================
    // 1. Google Gemini 통신 세팅
    // ==========================================
    if (isGemini) {
      const modelName = selectedModel === "gemini-3.1-flash-lite" ? "gemini-3.1-flash-lite-preview" : selectedModel;
      url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${key}`;
      
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
    // ==========================================
    // 2. Groq (Llama 3.3 70B) 통신 세팅
    // ==========================================
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
    // ==========================================
    // 3. Cohere (가볍고 빠른 버전) 통신 세팅
    // ==========================================
    else if (isCohere) {
      url = "https://api.cohere.ai/v1/chat";
      headers["Authorization"] = `Bearer ${key}`;
      headers["Accept"] = "application/stream+json";
      body = {
        // 🌟 무거운 Plus를 빼고, 가볍고 빠른 최신 기본 모델로 변경했습니다.
        model: "command-r-08-2024",
        message: options.message,
        temperature: 0.9,
        p: 0.95,
        stream: true,
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });

      if (response.status === 429 && isGemini) {
        useApiKeyStore.getState().rotateKey();
        const nextApiKey = useApiKeyStore.getState().getNextKey();
        if (nextApiKey === key) {
          throw new Error("모든 API 키의 할당량을 소진했습니다.");
        }
        return makeRequest(nextApiKey);
      }

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`API 통신 오류: 상태 코드 ${response.status}\n${errorText}`);
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
            } 
            else if (isGroq && line.startsWith("data: ")) {
              if (line.includes("[DONE]")) break; 
              const json = JSON.parse(line.substring(6));
              delta = json.choices?.[0]?.delta?.content;
            } 
            else if (isCohere) {
              const json = JSON.parse(line);
              if (json.event_type === "text-generation") {
                delta = json.text;
              }
            }

            if (delta) {
              options.onDelta(delta);
            }
          } catch (e) {
          }
        }
      }
      options.onDone();
    } catch (error) {
      console.error("스트리밍 채팅 오류:", error);
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  await makeRequest(currentApiKey);
};