import { describe, expect, it } from "vitest";
import { getAnswerChips, getGuidedActions } from "@/src/lib/aiGuidedActions";
import { membershipWith, ownerMembership } from "./fixtures";

// These three pass the tool explicitly: since the chips became tool-driven, an
// answer that read no data shows none at all, so a permission test needs a tool
// to have something to gate.
describe("getGuidedActions permission and confirmation guardrails", () => {
  it("marks inventory review as requiring confirmation", () => {
    const actions = getGuidedActions("review low stock", "", ownerMembership, "en", ["get_low_stock_ingredients"]);
    const inventory = actions.find((action) => action.id === "review-inventory");

    expect(inventory).toMatchObject({
      href: "/inventory",
      requiresConfirmation: true,
    });
  });

  it("marks menu review as requiring confirmation", () => {
    const actions = getGuidedActions("show low margin menu", "", ownerMembership, "en", ["get_lowest_margin_menu"]);
    const menu = actions.find((action) => action.id === "review-menu");

    expect(menu).toMatchObject({
      href: "/menu",
      requiresConfirmation: true,
    });
  });

  it("does not return inventory or report actions to a member without permission", () => {
    const actions = getGuidedActions("review low stock sales", "", membershipWith("view_menu"), "en", ["get_low_stock_ingredients"]);

    expect(actions).toEqual([]);
  });
});

describe("getGuidedActions derives chips from the structured tool", () => {
  // The real-world bug: a price answer whose prose contains "ขาย" used to show
  // sales-trend chips. Driving off the tool ignores the answer text entirely.
  it("a price answer (get_most_expensive_menu) shows menu chips, not sales chips", () => {
    const actions = getGuidedActions(
      "เมนูไหนในร้านขายแพงที่สุด",
      "เมนูที่ขายแพงที่สุดในร้านคือ ต้มยำกุ้งน้ำข้น ราคา 139 บาท",
      ownerMembership,
      "th",
      "get_most_expensive_menu",
    );
    const ids = actions.map((action) => action.id);
    expect(ids).not.toContain("fu-trend");
    expect(ids).not.toContain("fu-peak");
    expect(ids).toContain("review-menu");
  });

  it("a sales answer (get_sales_summary) shows sales-trend chips", () => {
    const actions = getGuidedActions(
      "ยอดขายรวมเท่าไหร่",
      "ยอดขายรวมช่วงนี้คือ ...",
      ownerMembership,
      "th",
      "get_sales_summary",
    );
    const ids = actions.map((action) => action.id);
    expect(ids).toContain("fu-trend");
  });
});

describe("getGuidedActions offers period pivots when the backend assumed scope", () => {
  it("a scope-less sales answer surfaces day/month pivots as the primary chips", () => {
    const actions = getGuidedActions(
      "ยอดขายเท่าไหร่",
      "ยอดขายรวมช่วง 30 วันล่าสุดคือ ...",
      ownerMembership,
      "th",
      "get_sales_summary",
      true, // scope_assumed from the backend
    );
    const ids = actions.map((action) => action.id);
    expect(ids).toContain("fu-scope-today");
    expect(ids).toContain("fu-scope-month");
    expect(ids).toContain("fu-scope-prev");
    // The period pivots win the slice(0, 3) over the generic sales chips.
    expect(ids).not.toContain("fu-trend");
    // Clicking re-asks the SAME metric, scoped to the chosen period.
    expect(actions.find((a) => a.id === "fu-scope-today")?.prompt).toBe("ยอดขายวันนี้เท่าไหร่");
  });

  it("does not show period pivots without the flag", () => {
    const actions = getGuidedActions("ยอดขายวันนี้เท่าไหร่", "...", ownerMembership, "th", "get_sales_summary");
    expect(actions.map((a) => a.id)).not.toContain("fu-scope-today");
  });

  it("a profit question re-asks กำไร, not ยอดขาย", () => {
    const actions = getGuidedActions("กำไรเท่าไหร่", "กำไร ...", ownerMembership, "th", undefined, true);
    expect(actions.find((a) => a.id === "fu-scope-prev")?.prompt).toBe("กำไรเดือนที่แล้วเท่าไหร่");
  });

  it("a dish-count question re-asks กี่จาน, not ยอดขาย", () => {
    const actions = getGuidedActions("ขายได้กี่จานทั้งหมด", "... ขายได้รวม ... จาน", ownerMembership, "th", undefined, true);
    expect(actions.find((a) => a.id === "fu-scope-today")?.prompt).toBe("วันนี้ขายได้กี่จาน");
  });
});

describe("chips follow the tools that ran, not the wording of the answer", () => {
  it("shows no chips when no tool ran", () => {
    // A greeting or a chat reply read no shop data. Chips there were the ones
    // the owner called "มั่ว": every answer wearing the same three buttons.
    expect(getGuidedActions("สวัสดีครับ", "สวัสดีครับ มีอะไรให้ช่วยไหมครับ", ownerMembership, "th", [])).toEqual([]);
    expect(getGuidedActions("หิวจัง", "ลองข้าวผัดกุ้งไหมครับ อร่อยดี", ownerMembership, "th", undefined)).toEqual([]);
  });

  it("does not offer menu chips for a peak-hours answer that merely says ขายดี", () => {
    const actions = getGuidedActions(
      "ร้านคนเยอะช่วงไหน",
      "วันอังคารขายดีที่สุด 179 รายการ ช่วง 13:00 ขายดีที่สุด 146 รายการ",
      ownerMembership,
      "th",
      ["get_peak_periods"],
    );
    expect(actions.some((a) => a.id === "fu-top-margin")).toBe(false);
    expect(actions.some((a) => a.id === "fu-slow")).toBe(false);
    expect(actions.some((a) => a.id === "fu-peak" || a.id === "fu-trend" || a.id === "open-report")).toBe(true);
  });

  it("unions the topics of every tool that ran", () => {
    const actions = getGuidedActions(
      "เครื่องดื่มตัวไหนกำไรดีสุด",
      "ชาไทยเย็น 11,101 บาท",
      ownerMembership,
      "th",
      ["get_menu_profit_by_category"],
    );
    expect(actions.some((a) => a.id === "fu-low-margin" || a.id === "review-menu")).toBe(true);
  });

  it("gives the floor tools no topic chips at all", () => {
    const actions = getGuidedActions("โต๊ะว่างมั้ย", "ว่างครบ 10 โต๊ะครับ", ownerMembership, "th", ["get_table_status"]);
    expect(actions).toEqual([]);
  });
});

describe("getAnswerChips", () => {
  const owner = ownerMembership;

  it("shows the model's follow-ups verbatim, label and prompt alike", () => {
    const chips = getAnswerChips("ของใกล้หมดมีอะไร", "ปีกไก่ใกล้หมด", owner, "th", ["get_low_stock_ingredients"], false, [
      "ปีกไก่พอถึงเมื่อไหร่",
      " สั่งปีกไก่เพิ่ม ",
      "เมนูไหนใช้ปีกไก่",
    ]);
    expect(chips.map((c) => c.label)).toEqual(["ปีกไก่พอถึงเมื่อไหร่", "สั่งปีกไก่เพิ่ม", "เมนูไหนใช้ปีกไก่"]);
    for (const chip of chips) expect(chip.prompt).toBe(chip.label);
  });

  it("falls back to the tool-keyed list when the model wrote none", () => {
    const withNone = getAnswerChips("ของใกล้หมดมีอะไร", "", owner, "th", ["get_low_stock_ingredients"], false, []);
    const fixed = getGuidedActions("ของใกล้หมดมีอะไร", "", owner, "th", ["get_low_stock_ingredients"], false);
    expect(withNone).toEqual(fixed);
  });

  it("keeps the period pivots in front when the backend assumed a window", () => {
    const chips = getAnswerChips("ยอดขายเท่าไหร่", "", owner, "th", ["get_sales_summary"], true, ["วันไหนขายดีสุด", "เมนูไหนทำเงินสุด", "เทียบเดือนก่อน"]);
    expect(chips[0]?.id).toBe("fu-scope-today");
    expect(chips.some((c) => c.label === "วันไหนขายดีสุด")).toBe(true);
    expect(chips.length).toBeLessThanOrEqual(5);
  });
});
