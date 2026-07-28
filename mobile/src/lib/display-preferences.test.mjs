import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DISPLAY_PREFERENCES,
  normalizeDisplayPreferences,
  scaleTextMetric,
  textSizeMultiplier,
} from './display-preferences.ts';

test('normalizes supported display preferences', () => {
  assert.deepEqual(
    normalizeDisplayPreferences({ language: 'en', textSize: 'large' }),
    { language: 'en', textSize: 'large' },
  );
});

test('falls back safely when persisted display preferences are malformed', () => {
  assert.deepEqual(
    normalizeDisplayPreferences({ language: 'jp', textSize: 'huge' }),
    DEFAULT_DISPLAY_PREFERENCES,
  );
  assert.deepEqual(
    normalizeDisplayPreferences(null),
    DEFAULT_DISPLAY_PREFERENCES,
  );
});

test('maps every text size to a stable multiplier and rounded metric', () => {
  assert.equal(textSizeMultiplier('small'), 0.9);
  assert.equal(textSizeMultiplier('normal'), 1);
  assert.equal(textSizeMultiplier('large'), 1.12);
  assert.equal(textSizeMultiplier('extra-large'), 1.25);
  assert.equal(scaleTextMetric(15, 'large'), 16.8);
});
