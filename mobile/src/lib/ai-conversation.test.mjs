import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendConversationTurn,
  createAIConversationRequestGuard,
  recentConversationHistory,
  selectOperationsSnapshot,
} from './ai-conversation.ts';
import {
  buildAIActionConfirmationPath,
  buildAIActionConfirmationRequest,
  buildAIActionCancellationPath,
  buildAIAskRequest,
  buildAIConversationDeletePath,
  canClearAIConversation,
  selectAIConversationId,
} from './ai-contract.ts';

const snapshot = {
  generated_at: '2026-07-29T10:00:00+07:00',
  sales_days: [],
  top_menu_items: [],
  menu_margins: [],
  low_margin_menus: [],
  analysis_readiness: {
    has_sales: true,
    sales_items: 3,
    margin_items: 2,
    costed_margin_items: 2,
    sold_menus: 2,
    sold_menus_with_recipes: 2,
    margin_cost_coverage_percent: 100,
    menu_recipe_coverage_percent: 100,
    can_analyze_revenue: true,
    can_analyze_margin: true,
    can_recommend_business_actions: true,
    warnings: [],
  },
  inventory_summary: {
    total_items: 4,
    low_items: 1,
    out_items: 0,
    value: 1200,
  },
  stock_risks: [],
};

test('keeps only the latest six messages sent to the AI backend', () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index + 1}`,
  }));

  assert.deepEqual(
    recentConversationHistory(history).map((message) => message.content),
    ['message-3', 'message-4', 'message-5', 'message-6', 'message-7', 'message-8'],
  );
});

test('appends one complete turn and caps visible conversation context', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `old-${index + 1}`,
  }));

  assert.deepEqual(
    appendConversationTurn(history, 'ยอดขายวันนี้', 'ยอดขายวันนี้คือ...').map(
      (message) => message.content,
    ),
    ['old-3', 'old-4', 'old-5', 'old-6', 'ยอดขายวันนี้', 'ยอดขายวันนี้คือ...'],
  );
});

test('preserves the latest real snapshot when a conversational reply contains an empty snapshot', () => {
  const emptySnapshot = {
    ...snapshot,
    generated_at: '',
    analysis_readiness: {
      ...snapshot.analysis_readiness,
      has_sales: false,
      can_recommend_business_actions: false,
    },
    inventory_summary: {
      total_items: 0,
      low_items: 0,
      out_items: 0,
      value: 0,
    },
  };

  assert.equal(selectOperationsSnapshot(snapshot, emptySnapshot), snapshot);
  assert.equal(selectOperationsSnapshot(snapshot, { ...snapshot, generated_at: '2026-07-29T11:00:00+07:00' })?.generated_at, '2026-07-29T11:00:00+07:00');
});

test('clearing a conversation invalidates an in-flight AI response', () => {
  const requests = createAIConversationRequestGuard();
  const oldRequest = requests.beginRequest();

  requests.clearConversation();

  assert.equal(requests.canApplyResponse(oldRequest), false);
  const newRequest = requests.beginRequest();
  assert.equal(requests.canApplyResponse(newRequest), true);
});

test('an older initial snapshot cannot replace a newer ask snapshot', () => {
  const newer = { ...snapshot, generated_at: '2026-08-03T10:05:00+07:00' };
  const older = { ...snapshot, generated_at: '2026-08-03T10:00:00+07:00' };

  assert.equal(selectOperationsSnapshot(newer, older), newer);
  assert.equal(selectOperationsSnapshot(older, newer), newer);
  assert.equal(selectOperationsSnapshot(newer, { ...older, generated_at: 'invalid' }), newer);
});

test('AI asks reuse a normalized server conversation without changing local history', () => {
  const history = [{ id: 'turn-1-assistant', role: 'assistant', content: 'ยอดขายวันนี้คือ...' }];

  assert.deepEqual(buildAIAskRequest('แล้วเมื่อวานล่ะ', history, ' conversation-123 '), {
    question: 'แล้วเมื่อวานล่ะ',
    history,
    conversation_id: 'conversation-123',
  });
  assert.deepEqual(buildAIAskRequest('สรุปยอดขาย', history, '  '), {
    question: 'สรุปยอดขาย',
    history,
  });
  assert.equal(selectAIConversationId(null, 'conversation-123'), 'conversation-123');
  assert.equal(selectAIConversationId('conversation-123', undefined), 'conversation-123');
  assert.equal(selectAIConversationId('conversation-123', 'not/a/server/id'), 'conversation-123');
});

test('AI mutation and reset paths encode identifiers and confirmation sends only its token', () => {
  assert.equal(
    buildAIConversationDeletePath('conversation/123'),
    '/api/v1/ai/operations/conversations/conversation%2F123',
  );
  assert.equal(
    buildAIActionConfirmationPath('preview/123'),
    '/api/v1/ai/operations/actions/preview%2F123/confirm',
  );
  assert.deepEqual(buildAIActionConfirmationRequest('one-time-token'), {
    confirmation_token: 'one-time-token',
  });
  assert.equal(
    buildAIActionCancellationPath('preview/123'),
    '/api/v1/ai/operations/actions/preview%2F123',
  );
});

test('conversation clear is blocked while the first ask or an action mutation is in flight', () => {
  assert.equal(canClearAIConversation({ loading: true }), false);
  assert.equal(canClearAIConversation({ actionConfirming: true }), false);
  assert.equal(canClearAIConversation({ actionCancelling: true }), false);
  assert.equal(canClearAIConversation({ clearingConversation: true }), false);
  assert.equal(canClearAIConversation({}), true);
});

test('leaving a pending confirm card behind cancels it on the server first', () => {
  // The server refuses every other command while a card is pending, so a new
  // chat, opening another chat, and switching restaurant all go through the
  // one helper that cancels the plan or preview server-side before dropping it.
  const screenSource = readFileSync(new URL('../../app/ai-assistant.tsx', import.meta.url), 'utf8');
  assert.match(screenSource, /const discardPending = useCallback\(\(\) => \{[\s\S]*?cancelAIActionPlan\(plan\.id\)[\s\S]*?cancelAIAction\(preview\.id\)/);
  assert.ok(screenSource.split(' discardPending();').length - 1 >= 2);
  // The card's own cancel button reaches the same endpoints.
  assert.match(screenSource, /onCancel=\{\(\) => \{ cancelAIActionPlan\(pendingPlan\.id\)/);
  assert.match(screenSource, /onCancel=\{\(\) => \{ cancelAIAction\(pendingPreview\.id\)/);
});
