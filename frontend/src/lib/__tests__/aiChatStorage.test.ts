import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatStorageKey,
  clearStoredChat,
  loadStoredConversationId,
  loadStoredMessages,
  saveConversationId,
  saveMessages,
} from "@/src/lib/aiChatStorage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const storage = new MemoryStorage();

Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

afterAll(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
});

beforeEach(() => {
  storage.clear();
  vi.useRealTimers();
});

describe("AI chat conversation storage", () => {
  it("scopes the shared chat key by restaurant and owner", () => {
    expect(chatStorageKey(12, 34)).toBe("restaurant_ai_chat:12:34");
    expect(chatStorageKey(null, 34)).toBeNull();
  });

  it("stores the server conversation ID separately and clears both records", () => {
    const key = chatStorageKey(12, 34);
    saveMessages(key, [{ id: "user-1", role: "user", content: "ยอดขายวันนี้" }]);
    saveConversationId(key, "conversation_123");

    expect(loadStoredMessages(key)).toHaveLength(1);
    expect(loadStoredConversationId(key)).toBe("conversation_123");

    clearStoredChat(key);

    expect(loadStoredMessages(key)).toBeNull();
    expect(loadStoredConversationId(key)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("rejects malformed IDs and expires a valid ID after seven days", () => {
    const key = chatStorageKey(12, 34);
    saveConversationId(key, "invalid/conversation");
    expect(loadStoredConversationId(key)).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T00:00:00Z"));
    saveConversationId(key, "conversation-123");
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);

    expect(loadStoredConversationId(key)).toBeNull();
  });
});
