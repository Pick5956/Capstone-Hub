export const AUTH_MODAL_FOCUS_DELAY_MS = 220;
export const AUTH_MODAL_CLOSE_DELAY_MS = 180;

export type AuthModalMotionPhase = "closed" | "entering" | "closing";

type AuthModalMotionClasses = {
  overlay: string;
  dialog: string;
};

type AuthModalFocusTarget = {
  focus(options?: { preventScroll?: boolean }): void;
};

type AuthModalTimerScheduler = (callback: () => void, delay: number) => number;

export function authModalMotionClasses(phase: AuthModalMotionPhase): AuthModalMotionClasses {
  if (phase === "closing") {
    return {
      overlay: "motion-overlay-exit",
      dialog: "motion-dialog-stationary-exit",
    };
  }

  if (phase === "entering") {
    return {
      overlay: "motion-overlay",
      dialog: "motion-dialog-stationary",
    };
  }

  return {
    overlay: "invisible pointer-events-none opacity-0",
    dialog: "opacity-0",
  };
}

export function scheduleAuthModalClose(
  close: () => void,
  schedule: AuthModalTimerScheduler,
  prefersReducedMotion = false,
): number {
  return schedule(close, prefersReducedMotion ? 0 : AUTH_MODAL_CLOSE_DELAY_MS);
}

export function scheduleAuthModalFocus(
  findTarget: () => AuthModalFocusTarget | null,
  schedule: AuthModalTimerScheduler,
): number {
  return schedule(() => {
    findTarget()?.focus({ preventScroll: true });
  }, AUTH_MODAL_FOCUS_DELAY_MS);
}
