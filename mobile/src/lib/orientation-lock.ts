// Phone screens stay portrait-only; tablets keep rotating. This mirrors how
// Instagram and Facebook behave and keeps the POS usable on a tablet stand.
//
// The threshold is deliberately NOT `breakpoints.tablet` (768). That one is a
// layout breakpoint applied to the *current* width, so it flips as soon as a
// device rotates, and an iPad mini (744pt wide) would fall under it and be
// treated as a phone. Orientation has to be decided from the smallest screen
// dimension, which never changes when the device turns, using the platform's
// own tablet cutoff (Android's sw600dp). Every current phone is well under it
// (the largest are ~430pt) and every iPad is above it.
export const TABLET_MIN_DIMENSION = 600;

export type ScreenSize = { width: number; height: number };

/** True when the device is phone-sized and should be pinned to portrait. */
export function shouldLockPortrait({ width, height }: ScreenSize): boolean {
  const smallestSide = Math.min(width, height);
  if (!Number.isFinite(smallestSide) || smallestSide <= 0) {
    // Dimensions are not readable yet; leave rotation alone rather than
    // locking a tablet by accident.
    return false;
  }
  return smallestSide < TABLET_MIN_DIMENSION;
}
