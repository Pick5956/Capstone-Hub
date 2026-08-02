import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resetRouteStack,
  shouldOpenSettings,
} from './navigation-runtime.ts';

test('restaurant switching dismisses the prior stack before entering the new workspace', () => {
  const actions = [];

  resetRouteStack(
    {
      dismissAll: () => actions.push('dismiss-all'),
      replace: (href) => actions.push(`replace:${href}`),
    },
    '/kitchen',
  );

  assert.deepEqual(actions, ['dismiss-all', 'replace:/kitchen']);
});

test('auth and restaurant invalidation targets use the same non-backtrackable reset', () => {
  for (const target of ['/login', '/restaurants']) {
    const actions = [];

    resetRouteStack(
      {
        dismissAll: () => actions.push('dismiss-all'),
        replace: (href) => actions.push(`replace:${href}`),
      },
      target,
    );

    assert.deepEqual(actions, ['dismiss-all', `replace:${target}`]);
  }
});

test('account navigation is a no-op on settings and all settings subroutes', () => {
  assert.equal(shouldOpenSettings('/settings'), false);
  assert.equal(shouldOpenSettings('/settings/account'), false);
  assert.equal(shouldOpenSettings('/settings/restaurant'), false);
});

test('account navigation remains available outside the settings route family', () => {
  assert.equal(shouldOpenSettings('/home'), true);
  assert.equal(shouldOpenSettings('/more'), true);
  assert.equal(shouldOpenSettings('/settings-legacy'), true);
});
