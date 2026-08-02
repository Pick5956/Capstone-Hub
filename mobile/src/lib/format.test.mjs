import assert from 'node:assert/strict';
import test from 'node:test';

import {
  itemStatusLabel,
  money,
  orderStatusLabel,
  tableStatusLabel,
} from './format.ts';

test('formats shared operational labels in the selected display language', () => {
  assert.equal(tableStatusLabel('reserved', 'th'), 'จอง');
  assert.equal(tableStatusLabel('reserved', 'en'), 'Reserved');
  assert.equal(orderStatusLabel('sent_to_kitchen', 'en'), 'Sent to kitchen');
  assert.equal(itemStatusLabel('ready', 'en'), 'Kitchen done');
});

test('formats currency with the selected locale while preserving baht', () => {
  assert.equal(money(1234, 'en'), '฿1,234');
  assert.equal(money(1234, 'th'), '฿1,234');
});
