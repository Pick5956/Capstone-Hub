// Phones stay portrait-only, tablets stay landscape-only. Phones follow how
// Instagram and Facebook behave; tablets are pinned landscape because the POS,
// kitchen board and table grid are built for a tablet sitting sideways on a
// stand, and letting an iPad flip to portrait only ever produced a worse
// version of the phone layout on a much bigger screen.
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

/** Which orientation this device is pinned to, or null while it is unknown. */
export type OrientationLockMode = 'portrait' | 'landscape';

export function orientationLockFor({ width, height }: ScreenSize): OrientationLockMode | null {
  const smallestSide = Math.min(width, height);
  if (!Number.isFinite(smallestSide) || smallestSide <= 0) {
    // Dimensions are not readable yet; leave rotation alone rather than
    // pinning a device to the wrong orientation on a bad measurement.
    return null;
  }
  return smallestSide < TABLET_MIN_DIMENSION ? 'portrait' : 'landscape';
}
