import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldLockPortrait, TABLET_MIN_DIMENSION } from './orientation-lock.ts';

test('phones are locked to portrait in both orientations', () => {
  // iPhone SE, iPhone 15, iPhone 15 Pro Max, a tall Android phone.
  for (const [width, height] of [[375, 667], [393, 852], [430, 932], [412, 915]]) {
    assert.equal(shouldLockPortrait({ width, height }), true);
    // Same device held sideways must classify identically.
    assert.equal(shouldLockPortrait({ width: height, height: width }), true);
  }
});

test('tablets keep rotating', () => {
  // iPad mini is the tightest case: 744pt wide, below the 768 layout breakpoint.
  for (const [width, height] of [[744, 1133], [820, 1180], [1024, 1366], [800, 1280]]) {
    assert.equal(shouldLockPortrait({ width, height }), false);
    assert.equal(shouldLockPortrait({ width: height, height: width }), false);
  }
});

test('the cutoff is exclusive at the tablet threshold', () => {
  assert.equal(shouldLockPortrait({ width: TABLET_MIN_DIMENSION - 1, height: 1000 }), true);
  assert.equal(shouldLockPortrait({ width: TABLET_MIN_DIMENSION, height: 1000 }), false);
});

test('unreadable dimensions leave rotation untouched', () => {
  assert.equal(shouldLockPortrait({ width: 0, height: 0 }), false);
  assert.equal(shouldLockPortrait({ width: Number.NaN, height: 800 }), false);
});
