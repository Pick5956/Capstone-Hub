// Shared, session-scoped chat persistence for the AI assistant. Both the
// floating widget and the full /ai-assistant page use the same key + envelope
// so their history stays in sync. History is keyed per (restaurant, user) and
// expires after one shift; nothing is stored server-side.

const CHAT_KEY_PREFIX = "restaurant_ai_chat";
const CHAT_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type ChatEnvelope<T> = { savedAt?: number; messages?: T[] };

export function chatStorageKey(restaurantId?: number | null, userId?: number | null): string | null {
  if (restaurantId == null || userId == null) return null;
  return `${CHAT_KEY_PREFIX}:${restaurantId}:${userId}`;
}

// Load the stored message array if it exists and is still fresh; otherwise remove
// the expired entry and return null. Returns raw messages for the caller to hydrate.
export function loadStoredMessages<T = unknown>(key: string | null): T[] | null {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ChatEnvelope<T>;
    if (!entry.savedAt || Date.now() - entry.savedAt > CHAT_HISTORY_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return Array.isArray(entry.messages) && entry.messages.length > 0 ? entry.messages : null;
  } catch {
    return null;
  }
}

// Persist the messages with a timestamp. A lone welcome message is not persisted.
export function saveMessages(key: string | null, messages: unknown[]): void {
  if (typeof window === "undefined" || !key || messages.length === 0) return;
  const lone = messages.length === 1 ? (messages[0] as { id?: string }) : null;
  if (lone && lone.id === "welcome") return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), messages }));
  } catch {
    // storage may be unavailable (private mode) — ignore
  }
}

export function clearStoredChat(key: string | null): void {
  if (typeof window === "undefined" || !key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Remove the legacy unscoped key and any expired chats from other users/sessions
// on this device (privacy hygiene on shared POS terminals).
export function purgeStaleChats(currentKey: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CHAT_KEY_PREFIX);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(`${CHAT_KEY_PREFIX}:`) || k === currentKey) continue;
      try {
        const other = JSON.parse(localStorage.getItem(k) || "null") as { savedAt?: number } | null;
        if (!other?.savedAt || Date.now() - other.savedAt > CHAT_HISTORY_TTL_MS) {
          localStorage.removeItem(k);
        }
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}
