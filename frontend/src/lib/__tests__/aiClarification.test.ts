import { describe, expect, it } from "vitest";
import { getUnclearRequestActions, resolveClarificationRequest } from "@/src/lib/aiClarification";
import { membershipWith, ownerMembership } from "./fixtures";

describe("resolveClarificationRequest ambiguous input guardrails", () => {
  it("turns a short menu input into choices instead of automatic navigation", () => {
    const clarification = resolveClarificationRequest("menu", ownerMembership, "en");

    expect(clarification?.actions.map((action) => action.id)).toEqual([
      "menu-page",
      "menu-top",
      "menu-margin",
    ]);
  });

  it("turns an ambiguous Thai menu input into choices", () => {
    const clarification = resolveClarificationRequest("เมนู", ownerMembership, "th");

    expect(clarification?.actions.map((action) => action.id)).toEqual([
      "menu-page",
      "menu-top",
      "menu-margin",
    ]);
  });

  it("limits menu choices to actions the member can access", () => {
    const clarification = resolveClarificationRequest("menu", membershipWith("manage_menu"), "en");

    expect(clarification?.actions.map((action) => action.id)).toEqual(["menu-page"]);
  });

  it("does not expose restaurant settings to a member without management permission", () => {
    const clarification = resolveClarificationRequest("settings", membershipWith("view_dashboard"), "en");

    expect(clarification?.actions.map((action) => action.id)).not.toContain("settings-restaurant");
  });
});

describe("getUnclearRequestActions", () => {
  it("offers useful recovery choices for an owner after unclear input", () => {
    expect(getUnclearRequestActions(ownerMembership, "en").map((action) => action.id)).toEqual([
      "unclear-stock-risk",
      "unclear-sales-summary",
      "unclear-menu-page",
    ]);
  });

  it("does not offer privileged analysis actions without permission", () => {
    expect(getUnclearRequestActions(membershipWith("manage_menu"), "en").map((action) => action.id)).toEqual([
      "unclear-menu-page",
    ]);
  });
});
