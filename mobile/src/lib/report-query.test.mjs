import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildManagerReportPath,
  buildTopMenuItemsPath,
  getBangkokReportMonth,
  shiftReportMonth,
} from './report-query.ts';

test('builds bounded report API queries', () => {
  assert.equal(buildManagerReportPath(14), '/api/v1/reports/manager?days=14');
  assert.equal(buildManagerReportPath(200), '/api/v1/reports/manager?days=90');
  assert.equal(
    buildTopMenuItemsPath({ year: 2026, month: 7 }),
    '/api/v1/reports/top-menu-items?year=2026&month=7',
  );
});

test('uses the Bangkok business month at UTC month boundaries', () => {
  assert.deepEqual(
    getBangkokReportMonth(new Date('2026-06-30T18:30:00.000Z')),
    { year: 2026, month: 7 },
  );
});

test('shifts report months across year boundaries', () => {
  assert.deepEqual(shiftReportMonth({ year: 2026, month: 1 }, -1), {
    year: 2025,
    month: 12,
  });
  assert.deepEqual(shiftReportMonth({ year: 2026, month: 12 }, 1), {
    year: 2027,
    month: 1,
  });
});
