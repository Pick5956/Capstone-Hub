import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGuidedAIActions,
  getUnclearAIActions,
  resolveAIClarificationRequest,
  resolveAINavigationRequest,
} from './ai-actions.ts';

const permissions = (...allowed) => (permission) => allowed.includes(permission);

test('navigation requests stay client-side and respect route permissions', () => {
  const allowed = permissions('view_reports', 'view_inventory');
  assert.deepEqual(
    resolveAINavigationRequest('เปิดหน้ารายงาน', allowed, '/ai-assistant'),
    {
      kind: 'navigate',
      href: '/reports',
      label: 'รายงาน',
      alreadyThere: false,
      message: 'พาไปหน้ารายงานให้แล้วครับ',
    },
  );
  assert.equal(resolveAINavigationRequest('เปิดหน้าครัว', allowed, '/ai-assistant'), null);
  assert.equal(resolveAINavigationRequest('เมนูไหนขายดี', allowed, '/ai-assistant'), null);
});

test('short ambiguous topics offer clarification actions before calling the model', () => {
  const clarification = resolveAIClarificationRequest(
    'คลัง',
    permissions('view_inventory', 'view_reports'),
  );
  assert.equal(clarification?.message, 'ต้องการเปิดคลัง หรือให้ช่วยตรวจวัตถุดิบที่เสี่ยงหมดครับ?');
  assert.deepEqual(clarification?.actions.map((action) => action.id), [
    'inventory-page',
    'inventory-risk',
  ]);
});

test('analysis replies expose permission-safe review actions with confirmation', () => {
  const actions = getGuidedAIActions(
    'ควรเติม stock อะไร',
    'วัตถุดิบใกล้หมด',
    permissions('view_inventory', 'view_reports'),
  );
  assert.deepEqual(actions.map((action) => action.id), ['review-inventory', 'open-report']);
  assert.equal(actions[0].requiresConfirmation, true);
});

test('unclear requests offer bounded useful follow-ups', () => {
  const actions = getUnclearAIActions(permissions('view_reports', 'manage_menu'));
  assert.deepEqual(actions.map((action) => action.id), [
    'unclear-stock-risk',
    'unclear-sales-summary',
    'unclear-menu-page',
  ]);
});
