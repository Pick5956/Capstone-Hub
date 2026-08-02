import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWorkspaceRoute } from './workspace-route.ts';

function route(roleName, permissions = []) {
  const allowed = new Set(permissions);
  return resolveWorkspaceRoute(roleName, (permission) => allowed.has(permission));
}

test('opens the role-specific workspace after restaurant selection', () => {
  assert.equal(route('chef', ['view_kitchen']), '/kitchen');
  assert.equal(route('waiter', ['take_order']), '/tables');
  assert.equal(route('cashier', ['view_orders']), '/orders');
  assert.equal(route('owner'), '/home');
  assert.equal(route('manager'), '/home');
});

test('custom roles use their most relevant operational permission', () => {
  assert.equal(route('custom', ['view_kitchen']), '/kitchen');
  assert.equal(route('custom', ['take_order']), '/tables');
  assert.equal(route('custom', ['view_orders']), '/orders');
  assert.equal(route('custom', ['view_dashboard']), '/home');
  assert.equal(route('custom', ['view_menu']), '/menu');
  assert.equal(route('custom', ['manage_menu']), '/menu');
});

test('a chef role without view_kitchen is not routed into a queue the backend will reject', () => {
  assert.equal(route('chef', ['update_order_status']), '/home');
});
