import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrderDetailRequestGuard } from './order-detail-runtime.ts';
import { createRequestGeneration } from './request-generation.ts';

test('an order mutation keeps its snapshot when an older detail poll finishes later', () => {
  const requests = createOrderDetailRequestGuard(createRequestGeneration());
  const stalePoll = requests.beginLoad();
  let visibleQuantity = 2;

  assert.notEqual(stalePoll, null);
  assert.equal(requests.beginMutation(), true);

  visibleQuantity = 3;
  requests.finishMutation();

  if (requests.canApplyLoad(stalePoll)) {
    visibleQuantity = 2;
  }

  assert.equal(visibleQuantity, 3);
  assert.equal(visibleQuantity + 1, 4);
});

test('detail loads are blocked during mutation and invalidated on focus cleanup', () => {
  const requests = createOrderDetailRequestGuard(createRequestGeneration());

  assert.equal(requests.beginMutation(), true);
  assert.equal(requests.beginMutation(), false);
  assert.equal(requests.beginLoad(), null);

  requests.finishMutation();
  const pendingFocusLoad = requests.beginLoad();
  assert.notEqual(pendingFocusLoad, null);
  assert.equal(requests.canApplyLoad(pendingFocusLoad), true);

  requests.invalidateLoads();

  assert.equal(requests.canApplyLoad(pendingFocusLoad), false);
});
