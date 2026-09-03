import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingPlan,
  loadPendingPlan,
  planWorthKeeping,
  savePendingPlan,
} from "@/src/lib/aiPendingPlan";
import type { AIActionPlan } from "@/src/types/ai";

// The confirmation card used to live only in component state, so leaving the
// page unmounted it. The server did not forget — it holds one pending plan at a
// time — so the next command came back with "confirm or cancel the one above"
// over a card that was gone, and the owner had to wait out the minute.

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
const store = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: store } });

afterAll(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

const KEY = "restaurant_ai_chat:1:1";

function plan(overrides: Partial<AIActionPlan> = {}): AIActionPlan {
  return {
    id: "plan-1",
    status: "pending",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    confirmation_token: "token-1",
    summary: "ปรับสต๊อก 2 รายการ",
    items: [
      { title: "กะเพรา", change: "500 → 2,500", unit: "กรัม" },
      { title: "หมูสับ", change: "1,000 → 3,000", unit: "กรัม" },
    ],
    ...overrides,
  };
}

describe("a plan card kept across a page switch", () => {
  beforeEach(() => {
    store.clear();
  });

  it("comes back with its items and its confirmation token", () => {
    savePendingPlan(KEY, plan());
    const restored = loadPendingPlan(KEY);
    expect(restored?.state).toBe("pending");
    expect(restored?.plan.confirmation_token).toBe("token-1");
    expect(restored?.plan.items).toHaveLength(2);
  });

  it("is not offered again once the server would refuse it", () => {
    savePendingPlan(KEY, plan({ expires_at: new Date(Date.now() - 1_000).toISOString() }));
    expect(loadPendingPlan(KEY)).toBeNull();
  });

  it("keeps a card that was already answered, clock or no clock", () => {
    // The whole point of the second half: after confirming or cancelling, the
    // card stays in the thread saying what happened instead of disappearing.
    savePendingPlan(KEY, plan({ expires_at: new Date(Date.now() - 60_000).toISOString() }), "cancelled");
    expect(loadPendingPlan(KEY)?.state).toBe("cancelled");
  });

  it("does not keep the confirmation token of a card that is already answered", () => {
    savePendingPlan(KEY, plan(), "done");
    expect(loadPendingPlan(KEY)?.plan.confirmation_token).not.toBe("token-1");
  });

  it("forgets the card when the plan goes away", () => {
    savePendingPlan(KEY, plan());
    savePendingPlan(KEY, null);
    expect(loadPendingPlan(KEY)).toBeNull();
  });

  it("forgets the card when the chat is cleared", () => {
    savePendingPlan(KEY, plan(), "done");
    clearPendingPlan(KEY);
    expect(loadPendingPlan(KEY)).toBeNull();
  });

  it("never restores one account's plan under another key", () => {
    savePendingPlan(KEY, plan());
    expect(loadPendingPlan("restaurant_ai_chat:2:9")).toBeNull();
  });

  it("drops anything that is not a plan rather than rendering a broken card", () => {
    store.setItem(`${KEY}:pending-plan`, JSON.stringify({ plan: { id: "plan-1" } }));
    expect(loadPendingPlan(KEY)).toBeNull();
    store.setItem(`${KEY}:pending-plan`, "not json at all");
    expect(loadPendingPlan(KEY)).toBeNull();
  });

  it("does nothing at all without a key, so a logged-out tab stores nothing", () => {
    savePendingPlan(null, plan());
    expect(store.length).toBe(0);
    expect(loadPendingPlan(null)).toBeNull();
  });
});

describe("planWorthKeeping", () => {
  it("refuses an empty plan, which would render a card with no rows", () => {
    expect(planWorthKeeping({ plan: plan({ items: [] }), state: "pending" })).toBe(false);
    expect(planWorthKeeping({ plan: plan({ items: [] }), state: "done" })).toBe(false);
  });

  it("refuses a plan whose expiry cannot be read", () => {
    expect(planWorthKeeping({ plan: plan({ expires_at: "soon" }), state: "pending" })).toBe(false);
  });
});
