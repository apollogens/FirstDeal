import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseChartBackground, validCalendarSlots } from '../src/lib/portfolio-presentation.ts';

test('zero and nonfinite expense totals have no invented proportions', () => {
  assert.equal(expenseChartBackground(0, [10, 20]), undefined);
  assert.equal(expenseChartBackground(NaN, [10]), undefined);
  assert.equal(expenseChartBackground(-1, [10]), undefined);
});
test('expense segments use real amounts and retain unclassified remainder', () => {
  const chart = expenseChartBackground(100, [25, 25]);
  assert.match(chart, /0% 25%/);
  assert.match(chart, /25% 50%/);
  assert.match(chart, /50% 100%/);
  assert.equal(expenseChartBackground(100, []), undefined);
});
test('calendar rejects invalid, reversed and out-of-range slots before limiting', () => {
  const from = new Date('2026-11-02T00:00:00Z');
  const to = new Date('2026-11-09T00:00:00Z');
  const good = { starts_at: '2026-11-06T12:30:00Z', ends_at: '2026-11-07T06:30:00Z', duration_minutes: 1080 };
  assert.deepEqual(validCalendarSlots([
    null, { starts_at: 'bad', ends_at: 'bad' },
    { starts_at: good.ends_at, ends_at: good.starts_at },
    { starts_at: '2026-10-01T12:00:00Z', ends_at: '2026-10-01T13:00:00Z' }, good,
  ], from, to), [good]);
  assert.deepEqual(validCalendarSlots({}, from, to), []);
});
