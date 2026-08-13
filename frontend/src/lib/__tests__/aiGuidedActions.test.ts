import { describe, expect, it } from "vitest";
import { getGuidedActions } from "@/src/lib/aiGuidedActions";
import { membershipWith, ownerMembership } from "./fixtures";

describe("getGuidedActions permission and confirmation guardrails", () => {
  it("marks inventory review as requiring confirmation", () => {
    const actions = getGuidedActions("review low stock", "", ownerMembership, "en");
    const inventory = actions.find((action) => action.id === "review-inventory");

    expect(inventory).toMatchObject({
      href: "/inventory",
      requiresConfirmation: true,
    });
  });

  it("marks menu review as requiring confirmation", () => {
    const actions = getGuidedActions("show low margin menu", "", ownerMembership, "en");
    const menu = actions.find((action) => action.id === "review-menu");

    expect(menu).toMatchObject({
      href: "/menu",
      requiresConfirmation: true,
    });
  });

  it("does not return inventory or report actions to a member without permission", () => {
    const actions = getGuidedActions("review low stock sales", "", membershipWith("view_menu"), "en");

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
});
