import { useState, useEffect, useCallback } from "react";
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
  // ⭐ API 키 항목 추가
  geminiApiKey: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  settings?: AppSettings;
  createdAt: number;
  updatedAt: number;
  chatBackground?: string;
  charAvatar?: string;
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
  // ⭐ 기본값 추가
  geminiApiKey: "",
};

function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const base = { ...DEFAULT_SETTINGS, ...(input || {}) } as AppSettings;
  return {
    ...base,
    supportingCharacters: Array.isArray(input?.supportingCharacters)
      ? (input.supportingCharacters as SupportingCharacter[])
      : [],
    geminiApiKey: input?.geminiApiKey || "", // 추가
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage save failed:", key, e);
  }
}

// Convert DB row to AppSettings
function rowToSettings(row: any, currentSettings: AppSettings): AppSettings {
  let supportingCharacters = currentSettings.supportingCharacters;
  if (row.supporting_characters) {
    try {
      const parsed =
        typeof row.supporting_characters === "string"
          ? JSON.parse(row.supporting_characters)
          : row.supporting_characters;
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
    // ⭐ DB에서 가져온 API 키 반영
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
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
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
      const payload: any = {
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
        // ⭐ DB에 저장할 때 키 포함
        gemini_api_key: normalized.geminiApiKey,
        updated_at: new Date().toISOString(),
      };
      
      await supabase
        .from("user_settings")
        .upsert(payload, { onConflict: "user_id" });
    }
  }, [user]);

  return { settings, setSettings };
}

// useMessages, useConversations는 기존과 동일하게 유지...
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
      id: generateUUID(),
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
  const { user } = useAuth();
  const [conversations, setConversationsState] = useState<Conversation[]>(() =>
    loadFromStorage("saved-conversations", [])
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (data && data.length > 0) {
        const convs: Conversation[] = data.map((row: any) => ({
          id: row.id,
          title: row.title,
          messages: (row.messages as ChatMessage[]) || [],
          settings: row.settings as AppSettings | undefined,
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
        }));
        setConversationsState(convs);
        saveToStorage("saved-conversations", convs);
      }
    })();
  }, [user]);

  useEffect(() => {
    saveToStorage("saved-conversations", conversations);
  }, [conversations]);

  const saveConversation = useCallback(async (messages: ChatMessage[], options: { existingId?: string, title?: string, settings?: AppSettings }) => {
    if (messages.length === 0) return null;

    const now = Date.now();
    const newTitle = options.title || messages.find((m) => m.role === "user")?.content.slice(0, 30) || "새 대화";

    const lightSettings = options.settings ? {
      ...options.settings,
      charAvatar: options.settings.charAvatar && options.settings.charAvatar.length > 500 ? "" : options.settings.charAvatar,
      chatBackground: options.settings.chatBackground && options.settings.chatBackground.length > 500 ? "" : options.settings.chatBackground,
    } : undefined;

    if (options.existingId) {
      let nextState: Conversation[] = [];
      setConversationsState((prev) => {
        nextState = prev.map((c) =>
          c.id === options.existingId
            ? {
                ...c,
                messages,
                title: newTitle,
                settings: lightSettings || c.settings,
                updatedAt: now,
              }
            : c
        );
        return nextState;
      });
      saveToStorage("saved-conversations", nextState);

      if (user) {
        await supabase
          .from("conversations")
          .update({
            messages: messages as any,
            title: newTitle,
            settings: (lightSettings || {}) as any,
            updated_at: new Date().toISOString(),
          })
          .eq("id", options.existingId)
          .eq("user_id", user.id);
      }
      return options.existingId;
    }

    const newId = generateUUID();
    const newConv: Conversation = {
      id: newId,
      title: newTitle,
      messages,
      settings: lightSettings,
      createdAt: now,
      updatedAt: now,
    };
    let nextState: Conversation[] = [];
    setConversationsState((prev) => {
      nextState = [newConv, ...prev];
      return nextState;
    });
    saveToStorage("saved-conversations", nextState);

    if (user) {
      await supabase
        .from("conversations")
        .insert({
          id: newId,
          user_id: user.id,
          title: newTitle,
          messages: messages as any,
          settings: (lightSettings || {}) as any,
        });
    }

    return newId;
  }, [user]);

  const deleteConversation = useCallback(async (id: string) => {
    setConversationsState((prev) => prev.filter((c) => c.id !== id));
    if (user) {
      await supabase
        .from("conversations")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
    }
  }, [user]);

  return { conversations, saveConversation, deleteConversation };
}