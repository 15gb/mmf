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
  charAvatar: string;
  chatBackground: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  settings?: AppSettings;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  myName: "",
  myIntro: "",
  charName: "AI 캐릭터",
  charPersona: "",
  charGreeting: "안녕! 만나서 반가워 😊",
  worldSetting: "",
  note: "",
  charAvatar: "",
  chatBackground: "",
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

  const deleteMessage = useCallback((id: string) => {
    setMessagesState((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deleteMessagesFrom = useCallback((id: string) => {
    setMessagesState((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
  }, []);

  const updateLastAssistant = useCallback((content: string) => {
    setMessagesState((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
      }
      return prev;
    });
  }, []);

  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    setMessagesState(msgs);
  }, []);

  return { messages, addMessage, clearMessages, deleteMessage, deleteMessagesFrom, updateLastAssistant, loadMessages };
}

export function useConversations() {
  const [conversations, setConversationsState] = useState<Conversation[]>(() =>
    loadFromStorage("saved-conversations", [])
  );

  useEffect(() => {
    saveToStorage("saved-conversations", conversations);
  }, [conversations]);

  const saveConversation = useCallback((messages: ChatMessage[], existingId?: string, settings?: AppSettings) => {
    if (messages.length === 0) return null;

    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) : "새 대화";
    const now = Date.now();

    if (existingId) {
      setConversationsState((prev) =>
        prev.map((c) =>
          c.id === existingId ? { ...c, messages, title, settings: settings || c.settings, updatedAt: now } : c
        )
      );
      return existingId;
    }

    const newConv: Conversation = {
      id: crypto.randomUUID(),
      title,
      messages,
      settings,
      createdAt: now,
      updatedAt: now,
    };
    setConversationsState((prev) => [newConv, ...prev]);
    return newConv.id;
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversationsState((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { conversations, saveConversation, deleteConversation };
}
