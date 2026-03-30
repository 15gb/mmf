import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateUUID } from "./utils";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SupportingCharacter {
  id: string;
  name: string;
  persona: string;
  avatar: string;
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
  supportingCharacters: SupportingCharacter[];
  geminiApiKey: string;
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
  supportingCharacters: [],
  geminiApiKey: "",
};

function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const base = { ...DEFAULT_SETTINGS, ...(input || {}) } as AppSettings;
  return {
    ...base,
    supportingCharacters: Array.isArray(input?.supportingCharacters) ? input.supportingCharacters : [],
    geminiApiKey: input?.geminiApiKey || "",
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(e); }
}

function rowToSettings(row: any, currentSettings: AppSettings): AppSettings {
  let supportingCharacters = currentSettings.supportingCharacters;
  if (row.supporting_characters) {
    try {
      const parsed = typeof row.supporting_characters === "string" ? JSON.parse(row.supporting_characters) : row.supporting_characters;
      supportingCharacters = Array.isArray(parsed) ? parsed : currentSettings.supportingCharacters;
    } catch { }
  }
  return {
    ...currentSettings,
    myName: row.my_name || "",
    myIntro: row.my_intro || "",
    charName: row.char_name || "AI 캐릭터",
    charPersona: row.char_persona || "",
    charGreeting: row.char_greeting || "안녕! 만나서 반가워 😊",
    worldSetting: row.world_setting || "",
    note: row.note || "",
    charAvatar: row.char_avatar || "",
    chatBackground: row.chat_background || "",
    geminiApiKey: row.gemini_api_key || "",
    supportingCharacters,
  };
}

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettingsState] = useState<AppSettings>(() =>
    normalizeSettings(loadFromStorage<Partial<AppSettings>>("app-settings", DEFAULT_SETTINGS))
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        const s = rowToSettings(data, settings);
        setSettingsState(s);
        saveToStorage("app-settings", s);
      }
    })();
  }, [user]);

  const setSettings = useCallback(async (updated: AppSettings) => {
    const normalized = normalizeSettings(updated);
    setSettingsState(normalized);
    saveToStorage("app-settings", normalized);
    if (user) {
      await supabase.from("user_settings").upsert({
        user_id: user.id,
        my_name: normalized.myName,
        my_intro: normalized.myIntro,
        char_name: normalized.charName,
        char_persona: normalized.charPersona,
        char_greeting: normalized.charGreeting,
        world_setting: normalized.worldSetting,
        note: normalized.note,
        char_avatar: normalized.charAvatar,
        chat_background: normalized.chatBackground,
        gemini_api_key: normalized.geminiApiKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  }, [user]);

  return { settings, setSettings };
}

export function useMessages() {
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => loadFromStorage("chat-messages", []));
  useEffect(() => { saveToStorage("chat-messages", messages); }, [messages]);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg = { ...msg, id: generateUUID(), timestamp: Date.now() };
    setMessagesState((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  return { 
    messages, 
    addMessage, 
    clearMessages: () => setMessagesState([]),
    deleteMessage: (id: string) => setMessagesState(prev => prev.filter(m => m.id !== id)),
    deleteMessagesFrom: (id: string) => setMessagesState(prev => {
      const idx = prev.findIndex(m => m.id === id);
      return idx === -1 ? prev : prev.slice(0, idx);
    }),
    updateLastAssistant: (content: string) => setMessagesState(prev => {
      const last = prev[prev.length - 1];
      return last?.role === "assistant" ? prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m) : prev;
    }),
    loadMessages: (msgs: ChatMessage[]) => setMessagesState(msgs)
  };
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversationsState] = useState<Conversation[]>(() => loadFromStorage("saved-conversations", []));
  const [showAutoSaves, setShowAutoSavesState] = useState(() => loadFromStorage("show-auto-saves", true));

  const setShowAutoSaves = useCallback((val: boolean) => {
    setShowAutoSavesState(val);
    saveToStorage("show-auto-saves", val);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (data) {
        const convs = data.map((row: any) => ({
          id: row.id,
          title: row.title,
          messages: row.messages || [],
          settings: row.settings,
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
        }));
        setConversationsState(convs);
        saveToStorage("saved-conversations", convs);
      }
    })();
  }, [user]);

  useEffect(() => { saveToStorage("saved-conversations", conversations); }, [conversations]);

  const saveConversation = useCallback(async (messages: ChatMessage[], options: { existingId?: string, title?: string, settings?: AppSettings }) => {
    if (messages.length === 0) return null;
    const now = Date.now();
    const newTitle = options.title || "새 대화";

    if (options.existingId) {
      setConversationsState(prev => prev.map(c => c.id === options.existingId ? { ...c, messages, title: newTitle, updatedAt: now } : c));
      if (user) {
        await supabase.from("conversations").update({ messages, title: newTitle, updated_at: new Date().toISOString() }).eq("id", options.existingId);
      }
      return options.existingId;
    }

    const newId = generateUUID();
    const newConv = { id: newId, title: newTitle, messages, settings: options.settings, createdAt: now, updatedAt: now };
    setConversationsState(prev => [newConv, ...prev]);
    if (user) {
      await supabase.from("conversations").insert({ id: newId, user_id: user.id, title: newTitle, messages, settings: options.settings });
    }
    return newId;
  }, [user]);

  const autoSaveConversation = useCallback(async (messages: ChatMessage[], settings: AppSettings) => {
    if (messages.length === 0) return;
    const baseTitle = settings.charName || "대화";
    const lastIdx = parseInt(localStorage.getItem("auto-save-counter") || "0");
    const nextIdx = lastIdx >= 5 ? 1 : lastIdx + 1;
    localStorage.setItem("auto-save-counter", nextIdx.toString());

    const autoTitle = `${baseTitle} - 자동저장(${nextIdx})`;
    const existing = conversations.find(c => c.title === autoTitle);

    await saveConversation(messages, { existingId: existing?.id, title: autoTitle, settings });
  }, [conversations, saveConversation]);

  const deleteConversation = useCallback(async (id: string) => {
    setConversationsState(prev => prev.filter(c => c.id !== id));
    if (user) await supabase.from("conversations").delete().eq("id", id);
  }, [user]);

  const filteredConversations = useMemo(() => {
    return conversations.filter(c => showAutoSaves ? true : !c.title.includes("- 자동저장("));
  }, [conversations, showAutoSaves]);

  return { 
    conversations: filteredConversations, 
    allConversations: conversations,
    saveConversation, 
    autoSaveConversation, 
    deleteConversation,
    showAutoSaves,
    setShowAutoSaves
  };
}