import { describe, expect, it } from "vitest";
import { createPosTableNavigationGuard } from "../posTableNavigation";

describe("createPosTableNavigationGuard", () => {
  it("keeps the first table navigation target and rejects later table clicks", () => {
    const guard = createPosTableNavigationGuard();

    expect(guard.tryStart(101)).toBe(true);
    expect(guard.tryStart(202)).toBe(false);
    expect(guard.current()).toBe(101);
  });

  it("allows another table after the navigation transition is released", () => {
    const guard = createPosTableNavigationGuard();

    expect(guard.tryStart(101)).toBe(true);
    guard.reset();

    expect(guard.tryStart(202)).toBe(true);
    expect(guard.current()).toBe(202);
  });
});
