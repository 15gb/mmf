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
  historySummary: string;
  selectedModel: string; // 🌟 새로 추가된 AI 모델 저장용 속성
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
  historySummary: "",
  selectedModel: "gemini-3.1-flash-lite", // 🌟 기본값을 현재 사용하시는 모델로 설정
};

function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const base = { ...DEFAULT_SETTINGS, ...(input || {}) } as AppSettings;
  return {
    ...base,
    supportingCharacters: Array.isArray(input?.supportingCharacters) ? input.supportingCharacters : [],
    geminiApiKey: input?.geminiApiKey || "",
    historySummary: input?.historySummary || "",
    selectedModel: input?.selectedModel || "gemini-3.1-flash-lite", // 🌟 모델 값 정규화
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, value: unknown) {
  try { 
    localStorage.setItem(key, JSON.stringify(value)); 
  } catch (e) { 
    console.warn("localStorage 저장 실패:", e); 
  }
}

function rowToSettings(row: any, currentSettings: AppSettings): AppSettings {
  let supportingCharacters = currentSettings.supportingCharacters;
  if (row.supporting_characters) {
    try {
      const parsed = typeof row.supporting_characters === "string" ? JSON.parse(row.supporting_characters) : row.supporting_characters;
      supportingCharacters = Array.isArray(parsed) ? parsed : currentSettings.supportingCharacters;
    } catch {
      supportingCharacters = currentSettings.supportingCharacters;
    }
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
    historySummary: row.history_summary || "",
    selectedModel: row.selected_model || currentSettings.selectedModel || "gemini-3.1-flash-lite", // 🌟 DB 로드 시 반영
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
        supporting_characters: JSON.stringify(normalized.supportingCharacters),
        history_summary: normalized.historySummary,
        // selected_model: normalized.selectedModel, // 🌟 DB 에러 방지를 위해 주석 처리 (로컬 스토리지에 정상 저장됨)
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  }, [user]);

  const resetRPContent = useCallback(async () => {
    // 🌟 초기화 시 모델 설정값 유지
    const resetData = { ...DEFAULT_SETTINGS, geminiApiKey: settings.geminiApiKey, selectedModel: settings.selectedModel };
    await setSettings(resetData);
  }, [settings.geminiApiKey, settings.selectedModel, setSettings]);

  return { settings, setSettings, resetRPContent };
}

export function useMessages() {
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => loadFromStorage("chat-messages", []));

  useEffect(() => {
    const handler = setTimeout(() => { saveToStorage("chat-messages", messages); }, 1000);
    return () => clearTimeout(handler);
  }, [messages]);
  
  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg = { ...msg, id: generateUUID(), timestamp: Date.now() };
    setMessagesState((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  const editMessage = useCallback((id: string, content: string) => {
    setMessagesState((prev) => prev.map(m => m.id === id ? { ...m, content } : m));
  }, []);

  const clearMessages = useCallback(() => setMessagesState([]), []);
  const deleteMessage = useCallback((id: string) => setMessagesState((prev) => prev.filter((m) => m.id !== id)), []);
  const deleteMessagesFrom = useCallback((id: string) => {
    setMessagesState((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      return idx === -1 ? prev : prev.slice(0, idx);
    });
  }, []);

  const updateLastAssistant = useCallback((content: string) => {
    setMessagesState((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
      return prev;
    });
  }, []);

  const loadMessages = useCallback((msgs: ChatMessage[]) => setMessagesState(msgs), []);

  return { messages, addMessage, editMessage, clearMessages, deleteMessage, deleteMessagesFrom, updateLastAssistant, loadMessages };
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversationsState] = useState<Conversation[]>(() => loadFromStorage("saved-conversations", []));
  const [showAutoSaves, setShowAutoSavesState] = useState(() => loadFromStorage("show-auto-saves", true));

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (data) {
        const remoteConvs = data.map((row: any) => ({
          id: row.id, title: row.title, messages: row.messages || [], settings: row.settings,
          createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime(),
        }));
        setConversationsState(prev => {
          const merged = [...prev];
          remoteConvs.forEach(remote => {
            const index = merged.findIndex(l => l.id === remote.id);
            if (index > -1) { if (remote.updatedAt > merged[index].updatedAt) merged[index] = remote; }
            else merged.push(remote);
          });
          const final = merged.sort((a, b) => b.updatedAt - a.updatedAt);
          saveToStorage("saved-conversations", final);
          return final;
        });
      }
    })();
  }, [user]);

  const saveConversation = useCallback(async (messages: ChatMessage[], options: { existingId?: string, title?: string, settings?: AppSettings }) => {
    if (messages.length === 0) return null;
    const now = Date.now();
    const convId = options.existingId || generateUUID();
    const newConv: Conversation = { id: convId, title: options.title || "새 대화", messages, settings: options.settings, createdAt: now, updatedAt: now };

    setConversationsState(prev => {
      const updated = [newConv, ...prev.filter(c => c.id !== convId)];
      localStorage.setItem("saved-conversations", JSON.stringify(updated));
      return updated;
    });

    if (user) {
      await supabase.from("conversations").upsert({
        id: convId, user_id: user.id, title: newConv.title, messages: messages as any,
        settings: options.settings as any, updated_at: new Date(now).toISOString()
      });
    }
    return convId;
  }, [user]);

  /** 🌟 [핵심 수정] 리액트 상태 대신 로컬 스토리지를 직접 뒤져서 중복을 원천 차단 */
  const autoSaveConversation = useCallback(async (messages: ChatMessage[], settings: AppSettings) => {
    if (messages.length === 0) return;
    const autoTitle = `[자동저장] ${settings.charName || "AI 캐릭터"}`;
    
    // 가장 신선한 데이터(localStorage)에서 기존 자동저장 파일을 찾습니다.
    const freshConvs = JSON.parse(localStorage.getItem("saved-conversations") || "[]") as Conversation[];
    const existing = freshConvs.find(c => c.title === autoTitle);
    
    await saveConversation(messages, { existingId: existing?.id, title: autoTitle, settings });
  }, [saveConversation]);

  const deleteConversation = useCallback(async (id: string) => {
    setConversationsState(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveToStorage("saved-conversations", updated);
      return updated;
    });
    if (user) await supabase.from("conversations").delete().eq("id", id);
  }, [user]);

  return { conversations: conversations.filter(c => showAutoSaves ? true : !c.title.startsWith("[자동저장]")), allConversations: conversations, saveConversation, autoSaveConversation, deleteConversation, showAutoSaves, setShowAutoSaves: (val: boolean) => { setShowAutoSavesState(val); saveToStorage("show-auto-saves", val); } };
}