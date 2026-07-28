import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHomeAttention,
  clampDashboardDate,
  resolveHomePriority,
  shiftDashboardDate,
  summarizeInventory,
  summarizeKitchenQueue,
} from './home-dashboard.ts';

const fullAccess = {
  canViewKitchen: true,
  canViewInventory: true,
  canTakeOrder: true,
  canViewOrders: true,
};

test('shifts dashboard dates across month, leap-year, and year boundaries', () => {
  assert.equal(shiftDashboardDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDashboardDate('2028-03-01', -1), '2028-02-29');
  assert.equal(shiftDashboardDate('2026-12-31', 1), '2027-01-01');
});

test('accepts valid history dates but never selects an invalid or future date', () => {
  assert.equal(clampDashboardDate('2026-07-29', '2026-07-28', '2026-07-29'), '2026-07-28');
  assert.equal(clampDashboardDate('2026-07-28', '2026-07-30', '2026-07-29'), '2026-07-28');
  assert.equal(clampDashboardDate('2026-07-28', 'not-a-date', '2026-07-29'), '2026-07-28');
});

test('summarizes overdue, ready, and active kitchen tickets from live queue timing', () => {
  const now = new Date('2026-07-29T05:20:00.000Z');
  const counts = summarizeKitchenQueue([
    {
      opened_at: '2026-07-29T05:00:00.000Z',
      items: [{ status: 'cooking', sent_at: '2026-07-29T05:09:00.000Z' }],
    },
    {
      opened_at: '2026-07-29T05:15:00.000Z',
      items: [{ status: 'ready', sent_at: '2026-07-29T05:12:00.000Z' }],
    },
    {
      opened_at: '2026-07-29T05:16:00.000Z',
      items: [{ status: 'pending', sent_at: '2026-07-29T05:16:00.000Z' }],
    },
  ], now);

  assert.deepEqual(counts, {
    overdueKitchen: 1,
    readyKitchen: 1,
    activeKitchen: 2,
  });
});

test('separates out-of-stock ingredients from low-stock ingredients', () => {
  assert.deepEqual(summarizeInventory([
    { stock: 0, min_stock: 10 },
    { stock: 12, min_stock: 10 },
    { stock: 16, min_stock: 10 },
    { stock: 3, min_stock: 0 },
  ]), {
    outOfStock: 1,
    lowStock: 1,
  });
});

test('ranks overdue kitchen work first, then ready food, then inventory risks', () => {
  const counts = {
    overdueKitchen: 2,
    readyKitchen: 3,
    activeKitchen: 4,
    outOfStock: 5,
    lowStock: 6,
    occupiedTables: 7,
  };

  assert.equal(resolveHomePriority(counts, fullAccess).key, 'kitchen-overdue');
  assert.equal(resolveHomePriority({ ...counts, overdueKitchen: 0 }, fullAccess).key, 'kitchen-ready');
  assert.equal(resolveHomePriority({ ...counts, overdueKitchen: 0, readyKitchen: 0 }, fullAccess).key, 'stock-out');
});

test('does not surface kitchen or inventory actions without their permissions', () => {
  const counts = {
    overdueKitchen: 9,
    readyKitchen: 8,
    activeKitchen: 7,
    outOfStock: 6,
    lowStock: 5,
    occupiedTables: 4,
  };
  const orderOnlyAccess = {
    canViewKitchen: false,
    canViewInventory: false,
    canTakeOrder: false,
    canViewOrders: true,
  };

  assert.equal(resolveHomePriority(counts, orderOnlyAccess).key, 'orders');
  assert.deepEqual(buildHomeAttention(counts, orderOnlyAccess), []);
});

test('builds only non-zero attention alerts that the current member can open', () => {
  const alerts = buildHomeAttention({
    overdueKitchen: 2,
    readyKitchen: 0,
    activeKitchen: 3,
    outOfStock: 1,
    lowStock: 4,
    occupiedTables: 0,
  }, fullAccess);

  assert.deepEqual(alerts.map((alert) => alert.key), [
    'kitchen-overdue',
    'stock-out',
    'stock-low',
  ]);
});
