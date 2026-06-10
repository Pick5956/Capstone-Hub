import { describe, expect, it } from "vitest";
import { resolveNavigationRequest } from "@/src/lib/aiNavigation";
import { membershipWith, ownerMembership } from "./fixtures";

describe("resolveNavigationRequest navigation guardrails", () => {
  it("navigates only when the user explicitly requests a known page", () => {
    const resolution = resolveNavigationRequest("open menu", ownerMembership, "en", "/home");

    expect(resolution).toMatchObject({
      kind: "navigate",
      href: "/menu",
      alreadyThere: false,
    });
  });

  it("navigates for a clear Thai request", () => {
    const resolution = resolveNavigationRequest("พาไปหน้าเมนู", ownerMembership, "th", "/home");

    expect(resolution).toMatchObject({
      kind: "navigate",
      href: "/menu",
      alreadyThere: false,
    });
  });

  it.each(["menu", "what does the menu page do?", "show menu margin analysis"])(
    "does not navigate for a mention without a navigation command: %s",
    (input) => {
      expect(resolveNavigationRequest(input, ownerMembership, "en", "/home")).toBeNull();
    },
  );

  it("does not navigate for an ambiguous Thai menu keyword", () => {
    expect(resolveNavigationRequest("เมนู", ownerMembership, "th", "/home")).toBeNull();
  });

  it("reports that the user is already on the requested page", () => {
    const resolution = resolveNavigationRequest("open menu", ownerMembership, "en", "/menu/edit");

    expect(resolution).toMatchObject({
      kind: "navigate",
      href: "/menu",
      alreadyThere: true,
    });
  });

  it("does not navigate to a page outside the member permissions", () => {
    const limitedMember = membershipWith("view_dashboard");

    expect(resolveNavigationRequest("open reports", limitedMember, "en", "/home")).toBeNull();
  });
});
