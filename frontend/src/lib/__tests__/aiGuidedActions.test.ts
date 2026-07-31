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
