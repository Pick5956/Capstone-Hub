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
