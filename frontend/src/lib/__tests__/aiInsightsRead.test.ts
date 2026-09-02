import { describe, expect, it } from "vitest";
import { insightKey } from "@/src/components/shared/AIInsightsPanel";
import type { AIInsight } from "@/src/types/ai";

const card = (over: Partial<AIInsight>): AIInsight => ({
  kind: "ingredient_low",
  severity: "warning",
  title: "กะเพรา พอใช้อีก 2 วัน",
  metric: "",
  detail: "",
  ...over,
});

// The bell used to count every card every day, so the same three warnings nagged
// forever and stopped being read at all. Read state hangs on this key, and the
// key has to hold two opposing properties: steady enough that reopening the panel
// does not resurrect a card, and sensitive enough that a changed situation counts
// as new.
describe("insight read-state key", () => {
  it("stays the same for the same card, so a read card stays read", () => {
    expect(insightKey(card({}))).toBe(insightKey(card({})));
    // Severity and the figures beneath the headline move on their own — stock
    // ticks down all day — and must not make a card unread again by themselves.
    expect(insightKey(card({ severity: "critical", metric: "เหลือ 1,322 กรัม" })))
      .toBe(insightKey(card({})));
  });

  it("changes when the situation behind the card changes", () => {
    // "พอใช้อีก 2 วัน" becoming "หมดสต๊อกแล้ว" is a new fact the owner has not
    // seen, and the bell should say so.
    expect(insightKey(card({ title: "กะเพรา หมดสต๊อกแล้ว" }))).not.toBe(insightKey(card({})));
    // A different ingredient is a different card even with identical wording.
    expect(insightKey(card({ title: "ข้าวคั่ว พอใช้อีก 2 วัน" }))).not.toBe(insightKey(card({})));
    // Same words, different kind of problem — still two cards.
    expect(insightKey(card({ kind: "dead_stock" }))).not.toBe(insightKey(card({})));
  });
});
