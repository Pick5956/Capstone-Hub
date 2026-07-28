import { describe, expect, it, vi } from "vitest";
import {
  AUTH_MODAL_CLOSE_DELAY_MS,
  AUTH_MODAL_FOCUS_DELAY_MS,
  authModalMotionClasses,
  scheduleAuthModalClose,
  scheduleAuthModalFocus,
} from "../authModalMotion";

describe("auth modal motion", () => {
  it("keeps the dialog stationary while entering", () => {
    const classes = authModalMotionClasses("entering");

    expect(classes.overlay).toBe("motion-overlay");
    expect(classes.dialog).toBe("motion-dialog-stationary");
  });

  it("keeps the overlay blocking the page while the stationary dialog exits", () => {
    const classes = authModalMotionClasses("closing");

    expect(classes.overlay).toContain("motion-overlay-exit");
    expect(classes.overlay).not.toContain("pointer-events-none");
    expect(classes.dialog).toBe("motion-dialog-stationary-exit");
  });

  it("keeps a closed modal out of view and interaction", () => {
    const classes = authModalMotionClasses("closed");

    expect(classes.overlay).toContain("invisible");
    expect(classes.overlay).toContain("pointer-events-none");
    expect(classes.dialog).toBe("opacity-0");
  });

  it("waits for the exit motion before closing the parent", () => {
    const close = vi.fn();
    let scheduledCallback: (() => void) | undefined;
    const schedule = vi.fn((callback: () => void) => {
      scheduledCallback = callback;
      return 31;
    });

    const timerId = scheduleAuthModalClose(close, schedule);

    expect(AUTH_MODAL_CLOSE_DELAY_MS).toBe(180);
    expect(timerId).toBe(31);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), AUTH_MODAL_CLOSE_DELAY_MS);
    expect(close).not.toHaveBeenCalled();

    scheduledCallback?.();

    expect(close).toHaveBeenCalledOnce();
  });

  it("does not hold a reduced-motion close open for the animation delay", () => {
    const schedule = vi.fn(() => 41);

    scheduleAuthModalClose(vi.fn(), schedule, true);

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 0);
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
