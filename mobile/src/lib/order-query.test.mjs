import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOrderListPath, formatBangkokDate } from './order-query.ts';

test('builds the current paginated order-list contract', () => {
  assert.equal(buildOrderListPath(), '/api/v1/orders');
  assert.equal(
    buildOrderListPath({
      status: 'active',
      payment_status: 'unpaid',
      search: 'โต๊ะ A 1',
      include_summary: true,
      table_id: 12,
      date: '2026-07-29',
      page: 2,
      limit: 25,
    }),
    '/api/v1/orders?status=active&payment_status=unpaid&search=%E0%B9%82%E0%B8%95%E0%B9%8A%E0%B8%B0+A+1&include_summary=true&table_id=12&date=2026-07-29&page=2&limit=25',
  );
});

test('omits empty filters instead of sending misleading values', () => {
  assert.equal(
    buildOrderListPath({
      status: '',
      payment_status: '',
      search: '  ',
      include_summary: false,
    }),
    '/api/v1/orders',
  );
});

test('formats dashboard dates using the backend Bangkok business date', () => {
  assert.equal(
    formatBangkokDate(new Date('2026-07-28T18:30:00.000Z')),
    '2026-07-29',
  );
});
