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

  it("uses the compact kitchen label in Thai navigation responses", () => {
    const resolution = resolveNavigationRequest("พาไปหน้าจอครัว", ownerMembership, "th", "/home");

    expect(resolution).toMatchObject({
      kind: "navigate",
      href: "/kitchen",
      label: "จอครัว",
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

  it.each([
    ["where is menu", "en"],
    ["where can I find reports", "en"],
    ["เมนูอยู่ตรงไหน", "th"],
    ["จอครัวอยู่ไหน", "th"],
  ] as const)(
    "does not intercept an informational location question: %s",
    (input, language) => {
      expect(resolveNavigationRequest(input, ownerMembership, language, "/home")).toBeNull();
    },
  );

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
