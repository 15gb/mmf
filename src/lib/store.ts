import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

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
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage save failed:", key, e);
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      try {
        const convs = JSON.parse(localStorage.getItem("saved-conversations") || "[]");
        if (convs.length > 5) {
          const trimmed = convs.slice(0, 5);
          localStorage.setItem("saved-conversations", JSON.stringify(trimmed));
          localStorage.setItem(key, JSON.stringify(value));
        }
      } catch {
        localStorage.removeItem("saved-conversations");
      }
    }
  }
}

// Convert DB row to AppSettings
function rowToSettings(row: any): AppSettings {
  return {
    myName: row.my_name || "",
    myIntro: row.my_intro || "",
    charName: row.char_name || "AI 캐릭터",
    charPersona: row.char_persona || "",
    charGreeting: row.char_greeting || "안녕! 만나서 반가워 😊",
    worldSetting: row.world_setting || "",
    note: row.note || "",
    charAvatar: row.char_avatar || "",
    chatBackground: row.chat_background || "",
  };
}

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettingsState] = useState<AppSettings>(() =>
    loadFromStorage("app-settings", DEFAULT_SETTINGS)
  );
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load from DB when user logs in
  useEffect(() => {
    if (!user) {
      setDbLoaded(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const s = rowToSettings(data);
        setSettingsState(s);
        saveToStorage("app-settings", s);
      }
      setDbLoaded(true);
    })();
  }, [user]);

  const setSettings = useCallback(async (updated: AppSettings) => {
    setSettingsState(updated);
    saveToStorage("app-settings", updated);

    if (user) {
      const payload = {
        user_id: user.id,
        my_name: updated.myName,
        my_intro: updated.myIntro,
        char_name: updated.charName,
        char_persona: updated.charPersona,
        char_greeting: updated.charGreeting,
        world_setting: updated.worldSetting,
        note: updated.note,
        char_avatar: updated.charAvatar,
        chat_background: updated.chatBackground,
        updated_at: new Date().toISOString(),
      };
      await supabase
        .from("user_settings")
        .upsert(payload, { onConflict: "user_id" });
    }
  }, [user]);

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
  const { user } = useAuth();
  const [conversations, setConversationsState] = useState<Conversation[]>(() =>
    loadFromStorage("saved-conversations", [])
  );
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load from DB when user logs in
  useEffect(() => {
    if (!user) {
      setDbLoaded(false);
      return;
    }
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
      setDbLoaded(true);
    })();
  }, [user]);

  // Save to localStorage as fallback
  useEffect(() => {
    if (dbLoaded || !user) {
      // Don't overwrite localStorage during DB load
    } else {
      saveToStorage("saved-conversations", conversations);
    }
  }, [conversations]);

  const saveConversation = useCallback(async (messages: ChatMessage[], existingId?: string, settings?: AppSettings) => {
    if (messages.length === 0) return null;

    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) : "새 대화";
    const now = Date.now();

    const lightSettings = settings ? {
      ...settings,
      charAvatar: settings.charAvatar && settings.charAvatar.length > 500 ? "" : settings.charAvatar,
      chatBackground: settings.chatBackground && settings.chatBackground.length > 500 ? "" : settings.chatBackground,
    } : undefined;

    if (existingId) {
      setConversationsState((prev) =>
        prev.map((c) =>
          c.id === existingId ? { ...c, messages, title, settings: lightSettings || c.settings, updatedAt: now } : c
        )
      );

      if (user) {
        await supabase
          .from("conversations")
          .update({
            messages: messages as any,
            title,
            settings: (lightSettings || {}) as any,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingId)
          .eq("user_id", user.id);
      }
      return existingId;
    }

    const newId = crypto.randomUUID();
    const newConv: Conversation = {
      id: newId,
      title,
      messages,
      settings: lightSettings,
      createdAt: now,
      updatedAt: now,
    };
    setConversationsState((prev) => [newConv, ...prev]);

    if (user) {
      await supabase
        .from("conversations")
        .insert({
          id: newId,
          user_id: user.id,
          title,
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
