import { describe, expect, it, vi } from "vitest";
import {
  AUTH_MODAL_CLOSE_DELAY_MS,
  AUTH_MODAL_FOCUS_DELAY_MS,
  scheduleAuthModalFocus,
} from "../authModalMotion";

describe("auth modal focus timing", () => {
  it("keeps the close delay aligned with the modal transition", () => {
    expect(AUTH_MODAL_CLOSE_DELAY_MS).toBe(200);
  });

  it("waits for the entrance motion before focusing without scrolling", () => {
    const focus = vi.fn();
    const target = { focus };
    let scheduledCallback: (() => void) | undefined;
    const schedule = vi.fn((callback: () => void) => {
      scheduledCallback = callback;
      return 17;
    });

    const timerId = scheduleAuthModalFocus(() => target, schedule);

    expect(timerId).toBe(17);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), AUTH_MODAL_FOCUS_DELAY_MS);
    expect(focus).not.toHaveBeenCalled();

    scheduledCallback?.();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does nothing when the target is no longer available", () => {
    let scheduledCallback: (() => void) | undefined;
    const schedule = (callback: () => void) => {
      scheduledCallback = callback;
      return 23;
    };

    scheduleAuthModalFocus(() => null, schedule);
    expect(() => scheduledCallback?.()).not.toThrow();
  });
});
