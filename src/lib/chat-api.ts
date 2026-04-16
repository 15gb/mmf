import { useApiKeyStore } from './api-key-store';

export interface StreamChatOptions {
  message: string;
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export const streamChat = async (options: StreamChatOptions) => {
  const { getNextKey, rotateKey } = useApiKeyStore.getState();
  let apiKey = getNextKey();

  // 🌟 설정 저장소(localStorage)에서 사용자가 선택한 모델 값을 가져옵니다.
  let selectedModel = "gemini-3.1-flash-lite"; // 기본값
  try {
    const storedSettings = localStorage.getItem("app-settings");
    if (storedSettings) {
      const settings = JSON.parse(storedSettings);
      if (settings.selectedModel) {
        selectedModel = settings.selectedModel;
      }
    }
  } catch (e) {
    console.warn("모델 설정을 불러오는데 실패했습니다.", e);
  }

  const makeRequest = async (key: string): Promise<void> => {
    let url = "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: any = {};

    // ==========================================
    // 1. Google Gemini 설정 (사용자님의 기존 세팅 유지)
    // ==========================================
    if (selectedModel.includes("gemini")) {
      // flash-lite의 경우 API 주소에 preview를 붙여줍니다.
      const modelName = selectedModel === "gemini-3.1-flash-lite" ? "gemini-3.1-flash-lite-preview" : selectedModel;
      url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${key}`;
      
      body = { 
        contents: [{ parts: [{ text: options.message }] }],
        generationConfig: {
          temperature: 0.9,      // 창의성 및 장문 서술 강화
          topP: 0.95,
          maxOutputTokens: 2048, // 풍부한 대화 분량 확보
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
    // 2. Groq (Llama 3.3 70B) 설정
    // ==========================================
    else if (selectedModel.includes("llama")) {
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
    // 3. Cohere (Command R) 설정
    // ==========================================
    else if (selectedModel.includes("command")) {
      url = "https://api.cohere.ai/v1/chat";
      headers["Authorization"] = `Bearer ${key}`;
      headers["Accept"] = "application/stream+json";
      
      body = {
        model: "command-r",
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

      // 429 에러(할당량 초과) 발생 시 기존 로테이션 로직 실행
      if (response.status === 429) {
        rotateKey();
        const nextApiKey = useApiKeyStore.getState().getNextKey();
        if (nextApiKey === key) {
          throw new Error("모든 API 키의 할당량을 소진했습니다.");
        }
        return makeRequest(nextApiKey);
      }

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`API 오류: ${response.status} - ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // 마지막의 불완전한 문자열은 다시 버퍼에 넣습니다.
        buffer = lines.pop() || "";

        for (const line of lines) {
          // 빈 줄이나 주석 건너뛰기
          if (!line.trim() || line.startsWith(":")) continue;

          try {
            let delta = "";

            // 1. Gemini SSE 파싱
            if (selectedModel.includes("gemini") && line.startsWith("data: ")) {
              const json = JSON.parse(line.substring(6));
              delta = json.candidates?.[0]?.content?.parts?.[0]?.text;
            }
            // 2. Groq/OpenAI SSE 파싱
            else if (selectedModel.includes("llama") && line.startsWith("data: ")) {
              if (line.includes("[DONE]")) break; // 스트림 종료
              const json = JSON.parse(line.substring(6));
              delta = json.choices?.[0]?.delta?.content;
            }
            // 3. Cohere JSON-Line 파싱 (data: 접두사가 없음)
            else if (selectedModel.includes("command")) {
              const json = JSON.parse(line);
              if (json.event_type === "text-generation") {
                delta = json.text;
              }
            }

            if (delta) {
              options.onDelta(delta);
            }
          } catch (e) {
            // 청크가 잘렸거나 JSON 형식이 아닐 경우 다음 라인을 대기합니다.
          }
        }
      }
      options.onDone();
    } catch (error) {
      console.error("스트리밍 채팅 오류:", error);
      options.onError(error instanceof Error ? error.message : String(error));
    }
  };

  await makeRequest(apiKey);
};