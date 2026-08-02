import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyApiInvalidation,
  loadStoredSession,
  publishSessionInvalidation,
  shouldApplySessionInvalidation,
  subscribeSessionInvalidation,
} from './session-runtime.ts';

const user = { ID: 7, email: 'operator@example.test' };
const memberships = [{ ID: 1, restaurant_id: 21 }];

test('stored session restore stays signed out when no token exists', async () => {
  let profileCalls = 0;

  const result = await loadStoredSession({
    getToken: async () => null,
    getProfile: async () => {
      profileCalls += 1;
      return user;
    },
    getMemberships: async () => memberships,
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, { kind: 'signed-out' });
  assert.equal(profileCalls, 0);
});

test('transient profile failure is recoverable and does not classify the token as invalid', async () => {
  const result = await loadStoredSession({
    getToken: async () => 'stored-token',
    getProfile: async () => {
      throw new TypeError('Network request failed');
    },
    getMemberships: async () => memberships,
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, { kind: 'recoverable-error' });
});

test('secure storage read failure is recoverable and never calls authenticated endpoints', async () => {
  let profileCalls = 0;

  const result = await loadStoredSession({
    getToken: async () => {
      throw new Error('secure storage unavailable');
    },
    getProfile: async () => {
      profileCalls += 1;
      return user;
    },
    getMemberships: async () => memberships,
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, { kind: 'recoverable-error' });
  assert.equal(profileCalls, 0);
});

test('profile 401 classifies the stored token as invalid', async () => {
  const result = await loadStoredSession({
    getToken: async () => 'expired-token',
    getProfile: async () => {
      throw Object.assign(new Error('invalid or expired token'), { status: 401 });
    },
    getMemberships: async () => memberships,
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, { kind: 'invalid-session' });
});

test('membership failure is distinct from a successful empty membership list', async () => {
  const result = await loadStoredSession({
    getToken: async () => 'stored-token',
    getProfile: async () => user,
    getMemberships: async () => {
      throw new TypeError('Network request failed');
    },
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, {
    kind: 'memberships-unavailable',
    user,
    storedRestaurantId: 21,
  });
  assert.equal('memberships' in result, false);
});

test('membership 401 invalidates the session instead of restoring the profile alone', async () => {
  const result = await loadStoredSession({
    getToken: async () => 'expired-token',
    getProfile: async () => user,
    getMemberships: async () => {
      throw Object.assign(new Error('invalid or expired token'), { status: 401 });
    },
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, { kind: 'invalid-session' });
});

test('successful restore returns the profile, memberships, and stored restaurant together', async () => {
  const result = await loadStoredSession({
    getToken: async () => 'stored-token',
    getProfile: async () => user,
    getMemberships: async () => memberships,
    getStoredRestaurantId: async () => 21,
  });

  assert.deepEqual(result, {
    kind: 'authenticated',
    user,
    memberships,
    storedRestaurantId: 21,
  });
});

test('authenticated 401 clears the whole session and publishes auth invalidation', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 401,
      message: 'invalid or expired token',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: 21,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.deepEqual(event, { kind: 'auth-invalidated' });
  assert.deepEqual(effects, ['clear-session', 'auth-invalidated']);
});

test('401 from a public login request does not invalidate an existing runtime session', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 401,
      message: 'invalid credentials',
      authenticatedRequest: false,
      requestToken: null,
      restaurantId: null,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.equal(event, null);
  assert.deepEqual(effects, []);
});

test('storage cleanup failure does not prevent runtime auth invalidation', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 401,
      message: 'invalid or expired token',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: 21,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => {
        effects.push('clear-session');
        throw new Error('secure storage unavailable');
      },
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.deepEqual(event, { kind: 'auth-invalidated' });
  assert.deepEqual(effects, ['clear-session', 'auth-invalidated']);
});

test('restaurant membership rejection clears only the active restaurant and publishes its id', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 403,
      message: 'not a member of this restaurant',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: 21,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(`${nextEvent.kind}:${nextEvent.restaurantId}`),
    },
  );

  assert.deepEqual(event, {
    kind: 'restaurant-invalidated',
    restaurantId: 21,
  });
  assert.deepEqual(effects, ['clear-restaurant', 'restaurant-invalidated:21']);
});

test('ordinary permission 403 never clears restaurant scope', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 403,
      message: 'missing manage_staff permission',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: 21,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.equal(event, null);
  assert.deepEqual(effects, []);
});

test('restaurant rejection without an attached restaurant scope does not clear the current restaurant', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 403,
      message: 'not a member of this restaurant',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: null,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.equal(event, null);
  assert.deepEqual(effects, []);
});

test('a delayed restaurant A rejection cannot clear newly selected restaurant B', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 403,
      message: 'not a member of this restaurant',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: 21,
      activeRestaurantId: 22,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.equal(event, null);
  assert.deepEqual(effects, []);
});

test('a delayed 401 cannot clear a newer signed-in session', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 401,
      message: 'invalid or expired token',
      authenticatedRequest: true,
      requestToken: '<old-test-token>',
      restaurantId: 21,
      activeRestaurantId: 21,
    },
    {
      clearSession: async (expectedToken) => {
        effects.push(`compare-session:${expectedToken}`);
        return false;
      },
      clearActiveRestaurant: async () => effects.push('clear-restaurant'),
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.equal(event, null);
  assert.deepEqual(effects, ['compare-session:<old-test-token>']);
});

test('restaurant switch during invalidation compare prevents stale cleanup and publish', async () => {
  const effects = [];

  const event = await applyApiInvalidation(
    {
      status: 403,
      message: 'not a member of this restaurant',
      authenticatedRequest: true,
      requestToken: '<test-token>',
      restaurantId: 21,
      activeRestaurantId: 21,
    },
    {
      clearSession: async () => effects.push('clear-session'),
      clearActiveRestaurant: async (expectedRestaurantId) => {
        effects.push(`compare-restaurant:${expectedRestaurantId}`);
        return false;
      },
      publish: (nextEvent) => effects.push(nextEvent.kind),
    },
  );

  assert.equal(event, null);
  assert.deepEqual(effects, ['compare-restaurant:21']);
});

test('provider applies restaurant invalidation only to the currently active restaurant', () => {
  const staleEvent = { kind: 'restaurant-invalidated', restaurantId: 21 };

  assert.equal(shouldApplySessionInvalidation(staleEvent, 22), false);
  assert.equal(shouldApplySessionInvalidation(staleEvent, 21), true);
  assert.equal(shouldApplySessionInvalidation({ kind: 'auth-invalidated' }, 22), true);
});

test('runtime invalidation subscriptions can be detached', () => {
  const received = [];
  const unsubscribe = subscribeSessionInvalidation((event) => received.push(event));

  publishSessionInvalidation({ kind: 'auth-invalidated' });
  unsubscribe();
  publishSessionInvalidation({ kind: 'restaurant-invalidated', restaurantId: 21 });

  assert.deepEqual(received, [{ kind: 'auth-invalidated' }]);
});

test('one failing runtime listener does not block remaining listeners', () => {
  const received = [];
  const unsubscribeFailing = subscribeSessionInvalidation(() => {
    throw new Error('listener failed');
  });
  const unsubscribeHealthy = subscribeSessionInvalidation((event) => received.push(event));

  publishSessionInvalidation({ kind: 'auth-invalidated' });
  unsubscribeFailing();
  unsubscribeHealthy();

  assert.deepEqual(received, [{ kind: 'auth-invalidated' }]);
});
