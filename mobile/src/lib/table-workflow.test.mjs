import assert from 'node:assert/strict';
import test from 'node:test';

import { reservationArrivalPlan, tableEntryAction } from './table-workflow.ts';

test('inactive tables cannot open a new order', () => {
  assert.equal(tableEntryAction('inactive', false), 'blocked');
});

test('table selection resumes orders before considering the resting table status', () => {
  assert.equal(tableEntryAction('occupied', true), 'resume');
  assert.equal(tableEntryAction('reserved', false), 'reservation');
  assert.equal(tableEntryAction('free', false), 'new');
});

test('accepting a reservation frees the table before opening a new order', () => {
  assert.deepEqual(reservationArrivalPlan(42), {
    tableStatus: 'free',
    route: {
      pathname: '/order/new',
      params: { tableId: '42' },
    },
  });
});
