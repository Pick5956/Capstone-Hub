import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatKitchenDuration,
  kitchenRoundDurationSeconds,
  kitchenRoundFinishedAt,
  kitchenRoundFinishedLabel,
  sortKitchenRoundsByFinish,
} from './kitchen-workflow.ts';

const round = (kitchenSentAt, items) => ({ kitchen_sent_at: kitchenSentAt, items });

test('a round finishes when its last item is marked ready', () => {
  const finished = kitchenRoundFinishedAt(round('2026-09-05T10:00:00Z', [
    { status: 'ready', ready_at: '2026-09-05T10:04:00Z' },
    { status: 'ready', ready_at: '2026-09-05T10:07:00Z' },
    { status: 'ready', ready_at: '2026-09-05T10:02:00Z' },
  ]));

  assert.equal(finished, new Date('2026-09-05T10:07:00Z').getTime());
});

test('items still cooking do not count towards the finish time', () => {
  const finished = kitchenRoundFinishedAt(round('2026-09-05T10:00:00Z', [
    { status: 'ready', ready_at: '2026-09-05T10:04:00Z' },
    { status: 'cooking', ready_at: '2026-09-05T10:59:00Z' },
  ]));

  assert.equal(finished, new Date('2026-09-05T10:04:00Z').getTime());
});

test('a served item still counts, since payment happens after the kitchen', () => {
  const finished = kitchenRoundFinishedAt(round('2026-09-05T10:00:00Z', [
    { status: 'served', ready_at: '2026-09-05T10:03:00Z' },
  ]));

  assert.equal(finished, new Date('2026-09-05T10:03:00Z').getTime());
});

test('a round with nothing ready has no finish time', () => {
  assert.equal(kitchenRoundFinishedAt(round('2026-09-05T10:00:00Z', [])), null);
  assert.equal(kitchenRoundFinishedAt(round('2026-09-05T10:00:00Z', null)), null);
  assert.equal(
    kitchenRoundFinishedAt(round('2026-09-05T10:00:00Z', [{ status: 'cooking', ready_at: null }])),
    null,
  );
});

test('duration runs from when the kitchen received the round to its last ready', () => {
  const seconds = kitchenRoundDurationSeconds(round('2026-09-05T10:00:00Z', [
    { status: 'ready', ready_at: '2026-09-05T10:07:30Z' },
  ]));

  assert.equal(seconds, 450);
});

test('duration falls back to the earliest item send when the round has no stamp', () => {
  const seconds = kitchenRoundDurationSeconds({
    items: [
      { status: 'ready', sent_at: '2026-09-05T10:01:00Z', ready_at: '2026-09-05T10:06:00Z' },
      { status: 'ready', sent_at: '2026-09-05T10:03:00Z', ready_at: '2026-09-05T10:05:00Z' },
    ],
  });

  assert.equal(seconds, 300);
});

test('a clock that runs backwards never reports a negative duration', () => {
  const seconds = kitchenRoundDurationSeconds(round('2026-09-05T10:10:00Z', [
    { status: 'ready', ready_at: '2026-09-05T10:04:00Z' },
  ]));

  assert.equal(seconds, 0);
});

test('duration is unknown when either end of the window is missing', () => {
  assert.equal(kitchenRoundDurationSeconds(round(null, [{ status: 'ready', ready_at: null }])), null);
  assert.equal(kitchenRoundDurationSeconds(round('2026-09-05T10:00:00Z', [])), null);
});

test('the most recently finished round is listed first', () => {
  const older = round('2026-09-05T10:00:00Z', [{ status: 'ready', ready_at: '2026-09-05T10:05:00Z' }]);
  const newer = round('2026-09-05T10:00:00Z', [{ status: 'ready', ready_at: '2026-09-05T10:20:00Z' }]);
  const unfinished = round('2026-09-05T10:00:00Z', [{ status: 'cooking', ready_at: null }]);

  const sorted = sortKitchenRoundsByFinish([older, unfinished, newer]);

  assert.equal(sorted[0], newer);
  assert.equal(sorted[1], older);
  assert.equal(sorted[2], unfinished);
});

test('sorting does not mutate the list it was given', () => {
  const rounds = [
    round('2026-09-05T10:00:00Z', [{ status: 'ready', ready_at: '2026-09-05T10:05:00Z' }]),
    round('2026-09-05T10:00:00Z', [{ status: 'ready', ready_at: '2026-09-05T10:20:00Z' }]),
  ];
  const first = rounds[0];

  sortKitchenRoundsByFinish(rounds);

  assert.equal(rounds[0], first);
});

test('durations read as minutes and seconds in both languages', () => {
  assert.equal(formatKitchenDuration(450, 'th'), '7 นาที 30 วินาที');
  assert.equal(formatKitchenDuration(450, 'en'), '7m 30s');
  assert.equal(formatKitchenDuration(0, 'en'), '0m 0s');
  assert.equal(formatKitchenDuration(59, 'en'), '0m 59s');
});

test('an unknown duration reads as a dash rather than zero', () => {
  assert.equal(formatKitchenDuration(null, 'th'), '−');
  assert.equal(formatKitchenDuration(Number.NaN, 'en'), '−');
  assert.equal(formatKitchenDuration(-5, 'en'), '−');
});

test('a round with no finish time has no clock label', () => {
  assert.equal(kitchenRoundFinishedLabel(round(null, []), 'th'), '−');
  assert.match(
    kitchenRoundFinishedLabel(round('2026-09-05T10:00:00Z', [
      { status: 'ready', ready_at: '2026-09-05T10:07:05Z' },
    ]), 'en'),
    /^\d{2}:\d{2}:\d{2}$/,
  );
});
