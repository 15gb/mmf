import type { AppSettings } from "./store";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

interface StreamChatOptions {
  messages: { role: "user" | "assistant"; content: string }[];
  settings: AppSettings;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamChat({ messages, settings, onDelta, onDone, onError }: StreamChatOptions) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, settings }),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "알 수 없는 오류" }));
      onError(errorData.error || `오류 발생 (${resp.status})`);
      return;
    }

    if (!resp.body) {
      onError("스트리밍을 시작할 수 없습니다.");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onDelta(text);
        } catch {
          // partial JSON, skip
        }
      }
    }

    onDone();
  } catch (e) {
    console.error("Stream error:", e);
    onError("네트워크 오류가 발생했습니다.");
  }
}
