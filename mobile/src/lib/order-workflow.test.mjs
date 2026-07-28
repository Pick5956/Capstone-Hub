import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCancelOrderForRole,
  canCloseEmptyOrder,
  isKitchenComplete,
  isOptionSelectionBelowMinimum,
  kitchenTicketKey,
  paymentReceivedAmount,
  validateKitchenCancelReason,
} from './order-workflow.ts';

test('only an open empty dine-in table order can use the mistake-recovery close action', () => {
  assert.equal(canCloseEmptyOrder({ order_type: 'dine_in', table_id: 7, status: 'open', items: [] }), true);
  assert.equal(canCloseEmptyOrder({ order_type: 'takeaway', table_id: null, status: 'open', items: [] }), false);
  assert.equal(canCloseEmptyOrder({ order_type: 'dine_in', table_id: 7, status: 'sent_to_kitchen', items: [] }), false);
  assert.equal(canCloseEmptyOrder({ order_type: 'dine_in', table_id: 7, status: 'open', items: [{ status: 'pending' }] }), false);
});

test('waiters can cancel only before the order is sent while other take-order roles follow the backend rule', () => {
  assert.equal(canCancelOrderForRole('waiter', 'open'), true);
  assert.equal(canCancelOrderForRole('waiter', 'sent_to_kitchen'), false);
  assert.equal(canCancelOrderForRole('manager', 'sent_to_kitchen'), true);
  assert.equal(canCancelOrderForRole('manager', 'completed'), false);
});

test('an order becomes billable when every active item is done by the kitchen', () => {
  assert.equal(isKitchenComplete([
    { status: 'ready' },
    { status: 'served' },
    { status: 'cancelled' },
  ]), true);
});

test('an order is not billable while an active item is pending or cooking', () => {
  assert.equal(isKitchenComplete([
    { status: 'ready' },
    { status: 'cooking' },
  ]), false);
  assert.equal(isKitchenComplete([
    { status: 'pending' },
  ]), false);
});

test('an order with no active kitchen items is not billable', () => {
  assert.equal(isKitchenComplete([]), false);
  assert.equal(isKitchenComplete([{ status: 'cancelled' }]), false);
});

test('kitchen tickets use the backend ticket id so separate rounds stay distinct', () => {
  assert.equal(kitchenTicketKey({
    ID: 42,
    kitchen_batch: 3,
    kitchen_ticket_id: '42:3',
  }), '42:3');
  assert.equal(kitchenTicketKey({ ID: 42, kitchen_batch: 4 }), '42:4');
});

test('mobile payment follows the web exact-payment workflow', () => {
  assert.equal(paymentReceivedAmount('cash', 287.5), 287.5);
  assert.equal(paymentReceivedAmount('promptpay_qr', 287.5), 287.5);
});

test('option groups enforce normalized min_select even when the group is marked optional', () => {
  assert.equal(isOptionSelectionBelowMinimum(1, 0), true);
  assert.equal(isOptionSelectionBelowMinimum(1, 1), false);
  assert.equal(isOptionSelectionBelowMinimum(0, 0), false);
  assert.equal(isOptionSelectionBelowMinimum(-2, 0), false);
});

test('kitchen cancellation requires a trimmed audit reason of at most 500 characters', () => {
  assert.deepEqual(validateKitchenCancelReason('   '), {
    reason: null,
    error: 'required',
  });
  assert.deepEqual(validateKitchenCancelReason(' ของหมด '), {
    reason: 'ของหมด',
    error: null,
  });
  assert.deepEqual(validateKitchenCancelReason('x'.repeat(501)), {
    reason: null,
    error: 'too_long',
  });
});
