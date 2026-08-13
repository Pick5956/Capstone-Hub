import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyHorizontalSwipe,
  getAdjacentNavigationTarget,
  getNavigationIndexByRouteName,
  getPagerSceneTranslateXFromPosition,
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

test('horizontal swipes map left to the next tab and right to the previous tab', () => {
  assert.equal(
    classifyHorizontalSwipe({ deltaX: -72, deltaY: 12, velocityX: -320 }),
    1,
  );
  assert.equal(
    classifyHorizontalSwipe({ deltaX: 72, deltaY: -12, velocityX: 320 }),
    -1,
  );
});

test('a short swipe is accepted when its horizontal release velocity is high enough', () => {
  assert.equal(
    classifyHorizontalSwipe({ deltaX: -18, deltaY: 4, velocityX: -900 }),
    1,
  );
});

test('slow short movement is not classified as a tab swipe', () => {
  assert.equal(
    classifyHorizontalSwipe({ deltaX: 24, deltaY: 3, velocityX: 180 }),
    null,
  );
});

test('mostly vertical movement is rejected even with enough distance or velocity', () => {
  assert.equal(
    classifyHorizontalSwipe({ deltaX: -72, deltaY: 68, velocityX: -900 }),
    null,
  );
  assert.equal(
    classifyHorizontalSwipe({ deltaX: 12, deltaY: 80, velocityX: 900 }),
    null,
  );
});

test('adjacent navigation targets follow the passed permission-filtered item order', () => {
  const permittedItems = [
    { key: 'home', href: '/home' },
    { key: 'kitchen', href: '/kitchen' },
    { key: 'more', href: '/more' },
  ];

  assert.deepEqual(getAdjacentNavigationTarget(permittedItems, 1, -1), {
    index: 0,
    href: '/home',
  });
  assert.deepEqual(getAdjacentNavigationTarget(permittedItems, 1, 1), {
    index: 2,
    href: '/more',
  });
});

test('adjacent navigation targets stop at both boundaries without wrapping', () => {
  const items = [{ href: '/home' }, { href: '/orders' }];

  assert.equal(getAdjacentNavigationTarget(items, 0, -1), null);
  assert.equal(getAdjacentNavigationTarget(items, items.length - 1, 1), null);
  assert.equal(getAdjacentNavigationTarget([], 0, 1), null);
  assert.equal(getAdjacentNavigationTarget(items, -1, 1), null);
});

test('the tab navigator route name is the canonical navigation index', () => {
  const permittedItems = [
    { key: 'home', href: '/home' },
    { key: 'pos', href: '/tables' },
    { key: 'kitchen', href: '/kitchen' },
  ];

  assert.equal(getNavigationIndexByRouteName(permittedItems, 'home'), 0);
  assert.equal(getNavigationIndexByRouteName(permittedItems, 'tables'), 1);
  assert.equal(getNavigationIndexByRouteName(permittedItems, 'pos'), 1);
  assert.equal(getNavigationIndexByRouteName(permittedItems, 'kitchen'), 2);
  assert.equal(getNavigationIndexByRouteName(permittedItems, 'orders'), -1);
  assert.equal(getNavigationIndexByRouteName(permittedItems, null), -1);
});

test('absolute pager position keeps the target scene fixed across route synchronization', () => {
  assert.equal(getPagerSceneTranslateXFromPosition(1, 1, 360), 0);
  assert.equal(getPagerSceneTranslateXFromPosition(2, 1, 360), 360);
  assert.equal(getPagerSceneTranslateXFromPosition(2, 1.5, 360), 180);
  assert.equal(getPagerSceneTranslateXFromPosition(1, 1.5, 360), -180);
  assert.equal(getPagerSceneTranslateXFromPosition(2, 2, 360), 0);
});

test('absolute pager position safely rejects invalid geometry', () => {
  assert.equal(getPagerSceneTranslateXFromPosition(1, Number.NaN, 360), 0);
  assert.equal(getPagerSceneTranslateXFromPosition(1, 1, 0), 0);
  assert.equal(getPagerSceneTranslateXFromPosition(1, 1, -360), 0);
  assert.equal(
    getPagerSceneTranslateXFromPosition(Number.POSITIVE_INFINITY, 1, 360),
    0,
  );
});
