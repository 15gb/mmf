import { useState, useEffect, useCallback } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface AppSettings {
  myName: string;
  myIntro: string;
  charName: string;
  charPersona: string;
  charGreeting: string;
  worldSetting: string;
  note: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  myName: "",
  myIntro: "",
  charName: "AI 캐릭터",
  charPersona: "",
  charGreeting: "안녕! 만나서 반가워 😊",
  worldSetting: "",
  note: "",
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() =>
    loadFromStorage("app-settings", DEFAULT_SETTINGS)
  );

  const setSettings = useCallback((updated: AppSettings) => {
    setSettingsState(updated);
    saveToStorage("app-settings", updated);
  }, []);

  return { settings, setSettings };
}

export function useMessages() {
  const [messages, setMessagesState] = useState<ChatMessage[]>(() =>
    loadFromStorage("chat-messages", [])
  );

  useEffect(() => {
    saveToStorage("chat-messages", messages);
  }, [messages]);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setMessagesState((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  const clearMessages = useCallback(() => {
    setMessagesState([]);
  }, []);

  return { messages, addMessage, clearMessages };
}
