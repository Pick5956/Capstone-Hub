import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inventoryItemAccess,
  kitchenAccess,
  orderDetailLoadResources,
  orderListAccess,
  orderListRequest,
  orderRoutePermissions,
  tableManagementAccess,
} from './permission-parity.ts';
import { can } from './rbac.ts';
import { parsePositiveRouteId } from './route-id.ts';

test('cashier order detail loads only the order while order takers also load menu resources', () => {
  assert.deepEqual(orderDetailLoadResources(false), ['order']);
  assert.deepEqual(orderDetailLoadResources(true), ['order', 'menu', 'categories']);
});

test('table viewers can open the management list without receiving mutation access', () => {
  assert.deepEqual(tableManagementAccess(true, false), {
    canView: true,
    canMutate: false,
  });
  assert.deepEqual(tableManagementAccess(false, true), {
    canView: true,
    canMutate: true,
  });
});

test('inventory viewers can open existing items read-only but cannot create new items', () => {
  assert.equal(inventoryItemAccess(true, true, false), 'read');
  assert.equal(inventoryItemAccess(false, true, false), 'denied');
  assert.equal(inventoryItemAccess(true, false, true), 'edit');
  assert.equal(inventoryItemAccess(false, false, true), 'edit');
});

test('kitchen queue visibility never falls back to update permission', () => {
  assert.deepEqual(kitchenAccess(false, true), {
    canView: false,
    canUpdate: true,
  });
  assert.deepEqual(kitchenAccess(true, false), {
    canView: true,
    canUpdate: false,
  });
});

test('legacy view_menu permission remains valid for a read-only menu catalog', () => {
  const membership = {
    status: 'active',
    role: {
      name: 'legacy_menu_viewer',
      permissions: '["view_menu"]',
    },
  };

  assert.equal(can(membership, 'view_menu'), true);
  assert.equal(can(membership, 'manage_menu'), false);
  assert.equal(can(membership, 'take_order'), false);
});

test('order navigation stays available for active order recovery without exposing archive queries', () => {
  assert.deepEqual(orderRoutePermissions, ['view_orders', 'take_order']);
  assert.equal(orderListAccess(false, true), 'operational');
  assert.deepEqual(
    orderListRequest('operational', {
      status: 'completed',
      search: 'old receipt',
      page: 2,
      limit: 25,
    }),
    {
      status: 'active',
      page: 2,
      limit: 25,
    },
  );
});

test('order archive filters, search, and summaries remain exclusive to view_orders', () => {
  assert.equal(orderListAccess(true, false), 'archive');
  assert.equal(orderListAccess(true, true), 'archive');
  assert.equal(orderListAccess(false, false), 'denied');
  assert.deepEqual(
    orderListRequest('archive', {
      status: 'completed',
      search: ' OR-42 ',
      page: 3,
      limit: 25,
    }),
    {
      status: 'completed',
      search: 'OR-42',
      include_summary: true,
      page: 3,
      limit: 25,
    },
  );
  assert.equal(
    orderListRequest('denied', {
      page: 1,
      limit: 25,
    }),
    null,
  );
});

test('positive route IDs distinguish an omitted create-mode ID from a malformed ID', () => {
  assert.deepEqual(parsePositiveRouteId(undefined), { kind: 'missing' });
  assert.deepEqual(parsePositiveRouteId(null), { kind: 'missing' });

  assert.deepEqual(parsePositiveRouteId('1'), { kind: 'valid', id: 1 });
  assert.deepEqual(parsePositiveRouteId(' 42 '), { kind: 'valid', id: 42 });
  assert.deepEqual(parsePositiveRouteId(7), { kind: 'valid', id: 7 });

  for (const value of [
    '',
    ' ',
    '0',
    '-1',
    '1.5',
    '1e2',
    '12abc',
    'NaN',
    0,
    -2,
    1.5,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    ['3'],
    true,
  ]) {
    assert.deepEqual(parsePositiveRouteId(value), { kind: 'invalid' });
  }
});
