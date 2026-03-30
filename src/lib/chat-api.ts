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

  const makeRequest = async (key: string): Promise<void> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:streamGenerateContent?alt=sse&key=${key}`;
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: options.message }] }] }),
      });

      if (response.status === 429) { // 할당량 초과 에러
        rotateKey();
        apiKey = useApiKeyStore.getState().getNextKey();
        if (apiKey === key) { // 모든 키를 다 돌았을 경우
          throw new Error("모든 API 키의 할당량을 소진했습니다.");
        }
        return makeRequest(apiKey); // 다음 키로 재귀 호출
      }

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`API 오류: ${response.status} ${response.statusText} - ${errorText}`);
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
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.substring(6));
              const delta = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (delta) {
                options.onDelta(delta);
              }
            } catch (e) {
              console.warn("스트림 데이터 파싱 오류:", e);
            }
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
