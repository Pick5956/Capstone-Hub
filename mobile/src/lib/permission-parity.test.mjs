import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inventoryItemAccess,
  kitchenAccess,
  orderDetailLoadResources,
  tableManagementAccess,
} from './permission-parity.ts';
import { can } from './rbac.ts';

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
