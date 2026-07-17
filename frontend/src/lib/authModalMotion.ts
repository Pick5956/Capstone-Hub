export const AUTH_MODAL_FOCUS_DELAY_MS = 220;
export const AUTH_MODAL_CLOSE_DELAY_MS = 200;

type AuthModalFocusTarget = {
  focus(options?: { preventScroll?: boolean }): void;
};

type AuthModalTimerScheduler = (callback: () => void, delay: number) => number;

export function scheduleAuthModalFocus(
  findTarget: () => AuthModalFocusTarget | null,
  schedule: AuthModalTimerScheduler,
): number {
  return schedule(() => {
    findTarget()?.focus({ preventScroll: true });
  }, AUTH_MODAL_FOCUS_DELAY_MS);
}
