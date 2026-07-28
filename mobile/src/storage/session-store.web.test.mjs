import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearActiveRestaurantId,
  clearSession,
  clearToken,
  getActiveRestaurantId,
  getToken,
  getTokenType,
  setActiveRestaurantId,
  setToken,
} from './session-store.web.ts';

function generatedToken() {
  return Array.from(
    { length: 12 },
    (_, index) => String.fromCodePoint(65 + (index % 26)),
  ).join('');
}

test('keeps the web session in memory while the app is running', async () => {
  await clearSession();
  const token = generatedToken();

  await setToken(token, 'Bearer');
  await setActiveRestaurantId(42);

  assert.equal(await getToken(), token);
  assert.equal(await getTokenType(), 'Bearer');
  assert.equal(await getActiveRestaurantId(), 42);
});

test('clears token and restaurant state without browser storage APIs', async () => {
  await setToken(generatedToken(), 'Custom');
  await setActiveRestaurantId(42);

  await clearToken();
  await clearActiveRestaurantId();

  assert.equal(await getToken(), null);
  assert.equal(await getTokenType(), 'Bearer');
  assert.equal(await getActiveRestaurantId(), null);
});
