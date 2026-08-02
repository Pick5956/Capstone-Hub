import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveActiveRestaurantId,
  upsertMembership,
} from './auth-state.ts';

const membership = (id, restaurantId, status = 'active') => ({
  ID: id,
  user_id: 10,
  restaurant_id: restaurantId,
  role_id: 2,
  status,
  joined_at: '2026-07-29T00:00:00Z',
});

test('accepted or newly created membership is available locally before a refresh', () => {
  const current = [membership(1, 11), membership(2, 12)];
  const replacement = { ...membership(3, 12), role_id: 5 };

  assert.deepEqual(upsertMembership(current, replacement), [
    membership(1, 11),
    replacement,
  ]);
  assert.deepEqual(upsertMembership(current, membership(4, 13)), [
    ...current,
    membership(4, 13),
  ]);
});

test('membership upsert does not mutate the current list', () => {
  const current = [membership(1, 11)];
  const snapshot = structuredClone(current);

  upsertMembership(current, { ...membership(2, 11), status: 'suspended' });

  assert.deepEqual(current, snapshot);
});

test('restored restaurant keeps a valid choice or selects the only membership', () => {
  const memberships = [membership(1, 11), membership(2, 12)];
  assert.equal(resolveActiveRestaurantId(memberships, 12), 12);
  assert.equal(resolveActiveRestaurantId(memberships, 99), null);
  assert.equal(resolveActiveRestaurantId([membership(1, 11)], null), 11);
  assert.equal(resolveActiveRestaurantId([], 11), null);
});
