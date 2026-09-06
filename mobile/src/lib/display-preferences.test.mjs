import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DISPLAY_PREFERENCES,
  normalizeDisplayPreferences,
} from './display-preferences.ts';

test('normalizes supported display preferences', () => {
  assert.deepEqual(normalizeDisplayPreferences({ language: 'en' }), { language: 'en' });
});

test('falls back safely when persisted display preferences are malformed', () => {
  assert.deepEqual(
    normalizeDisplayPreferences({ language: 'jp' }),
    DEFAULT_DISPLAY_PREFERENCES,
  );
  assert.deepEqual(normalizeDisplayPreferences(null), DEFAULT_DISPLAY_PREFERENCES);
});

test('drops a persisted text size instead of carrying it forward', () => {
  // Older installs stored textSize. Normalizing must not resurrect the field,
  // or a stale value would travel through every future write.
  assert.deepEqual(
    normalizeDisplayPreferences({ language: 'en', textSize: 'extra-large' }),
    { language: 'en' },
  );
});
