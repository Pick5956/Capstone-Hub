import { describe, expect, it } from "vitest";
import { shouldMountFloatingAssistant } from "@/src/lib/aiFloatingVisibility";

describe("floating AI assistant visibility", () => {
  it("does not mount the duplicate chat runtime on the dedicated assistant page", () => {
    expect(shouldMountFloatingAssistant("/ai-assistant")).toBe(false);
    expect(shouldMountFloatingAssistant("/home")).toBe(true);
  });
});
