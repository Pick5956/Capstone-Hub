import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatStorageKey,
  clearStoredChat,
  loadStoredConversationId,
  loadStoredMessages,
  saveConversationId,
  saveMessages,
  subscribeToChatWrites,
  type ChatStorageWrite,
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

  it("synchronizes scoped writes with another same-window chat without echoing or looping", () => {
    const key = chatStorageKey(12, 34);
    const otherKey = chatStorageKey(99, 34);
    const pageSource = Symbol("page");
    const floatingSource = Symbol("floating");
    const pageWrites: string[] = [];
    const floatingWrites: ChatStorageWrite[] = [];
    const unsubscribePage = subscribeToChatWrites(key, pageSource, (write) => pageWrites.push(write.kind));
    const unsubscribeFloating = subscribeToChatWrites(key, floatingSource, (write) => floatingWrites.push(write));
    const messages = [{ id: "user-1", role: "user", content: "Show today's sales" }];

    saveMessages(key, messages, pageSource);
    saveConversationId(key, "conversation-123", pageSource);
    saveMessages(otherKey, [{ id: "private", role: "user", content: "Other restaurant" }], pageSource);

    expect(pageWrites).toEqual([]);
    expect(floatingWrites).toEqual([
      { key, kind: "messages", messages },
      { key, kind: "conversation", conversationId: "conversation-123" },
    ]);

    // A receiving surface persists its React state too. Identical content must
    // not be broadcast back to the writer and start a feedback loop.
    saveMessages(key, messages, floatingSource);
    saveConversationId(key, "conversation-123", floatingSource);

    expect(pageWrites).toEqual([]);
    expect(floatingWrites).toHaveLength(2);

    unsubscribePage();
    unsubscribeFloating();
  });

  it("overwrites corrupt stored envelopes and still publishes the repaired writes", () => {
    const key = chatStorageKey(21, 43);
    const source = Symbol("writer");
    const writes: ChatStorageWrite[] = [];
    const unsubscribe = subscribeToChatWrites(key, Symbol("reader"), (write) => writes.push(write));
    const messages = [{ id: "user-2", role: "user", content: "Repair this chat" }];
    storage.setItem(key!, "{broken-json");
    storage.setItem(`${key}:server-conversation`, "{broken-json");

    saveMessages(key, messages, source);
    saveConversationId(key, "conversation-repaired", source);

    expect(loadStoredMessages(key)).toEqual(messages);
    expect(loadStoredConversationId(key)).toBe("conversation-repaired");
    expect(writes.map((write) => write.kind)).toEqual(["messages", "conversation"]);

    unsubscribe();
  });

  it("keeps same-window synchronization loop-free when localStorage is unavailable", () => {
    const key = chatStorageKey(55, 66);
    const pageSource = Symbol("page-private-mode");
    const floatingSource = Symbol("floating-private-mode");
    const pageWrites: ChatStorageWrite[] = [];
    const floatingWrites: ChatStorageWrite[] = [];
    const unavailableStorage = new Proxy(storage, {
      get() {
        throw new Error("storage unavailable");
      },
    });
    const unsubscribePage = subscribeToChatWrites(key, pageSource, (write) => pageWrites.push(write));
    const unsubscribeFloating = subscribeToChatWrites(key, floatingSource, (write) => floatingWrites.push(write));
    const messages = [{ id: "user-private", role: "user", content: "Same-window only" }];
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: unavailableStorage });

    try {
      saveMessages(key, messages, pageSource);
      saveConversationId(key, "conversation-private", pageSource);
      saveMessages(key, messages, floatingSource);
      saveConversationId(key, "conversation-private", floatingSource);

      expect(pageWrites).toEqual([]);
      expect(floatingWrites.map((write) => write.kind)).toEqual(["messages", "conversation"]);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
      unsubscribePage();
      unsubscribeFloating();
    }
  });
});
