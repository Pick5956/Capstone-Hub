import assert from 'node:assert/strict';
import test from 'node:test';

import { orientationLockFor, TABLET_MIN_DIMENSION } from './orientation-lock.ts';

test('phones are locked to portrait in both orientations', () => {
  // iPhone SE, iPhone 15, iPhone 15 Pro Max, a tall Android phone.
  for (const [width, height] of [[375, 667], [393, 852], [430, 932], [412, 915]]) {
    assert.equal(orientationLockFor({ width, height }), 'portrait');
    // Same device held sideways must classify identically.
    assert.equal(orientationLockFor({ width: height, height: width }), 'portrait');
  }
});

test('tablets are locked to landscape in both orientations', () => {
  // iPad mini is the tightest case: 744pt wide, below the 768 layout breakpoint.
  for (const [width, height] of [[744, 1133], [820, 1180], [1024, 1366], [800, 1280]]) {
    assert.equal(orientationLockFor({ width, height }), 'landscape');
    // A tablet picked up in portrait must still resolve to landscape, otherwise
    // the lock would flip back and forth with the device.
    assert.equal(orientationLockFor({ width: height, height: width }), 'landscape');
  }
});

test('the cutoff is exclusive at the tablet threshold', () => {
  assert.equal(orientationLockFor({ width: TABLET_MIN_DIMENSION - 1, height: 1000 }), 'portrait');
  assert.equal(orientationLockFor({ width: TABLET_MIN_DIMENSION, height: 1000 }), 'landscape');
});

test('unreadable dimensions leave rotation untouched', () => {
  assert.equal(orientationLockFor({ width: 0, height: 0 }), null);
  assert.equal(orientationLockFor({ width: Number.NaN, height: 800 }), null);
});
