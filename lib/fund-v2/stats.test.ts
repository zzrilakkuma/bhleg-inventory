import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesFromPeriods, expenseGroups, incomeShares, salonByPeriod, EXPENSE_GROUPS } from './stats.ts';
import type { PeriodSummary } from './api.ts';

const s = (month: string, period_no: number, o: Partial<PeriodSummary> = {}): PeriodSummary => ({
  month, period_no, settled_on: `${month}-20`, end_total: 100, end_main: 10, min_main: 5,
  income_by_source: {}, expense_by_group: {}, salon_income: 0, ...o,
});

test('seriesFromPeriods: oldest first, #n suffix for period_no>1', () => {
  const r = seriesFromPeriods([s('2026-10', 2, { end_total: 3 }), s('2026-10', 1), s('2026-09', 1)]);
  assert.deepEqual(r.map((x) => x.label), ['2026-09', '2026-10', '2026-10#2']);
  assert.equal(r[2].endTotal, 3);
});

test('expenseGroups: fixed five groups, missing = 0, sums across periods', () => {
  const r = expenseGroups([
    s('2026-10', 1, { expense_by_group: { 交通與車輛: 100, 其他: 5 } }),
    s('2026-09', 1, { expense_by_group: { 交通與車輛: 50 } }),
  ]);
  assert.deepEqual(r.map((x) => x.group), [...EXPENSE_GROUPS]);
  assert.deepEqual(r.map((x) => x.amount), [0, 150, 0, 0, 5]);
});

test('incomeShares: sorted desc, pct sums to 100, unknown -> 其他', () => {
  const r = incomeShares([s('2026-10', 1, { income_by_source: { donation: 1, salon: 1, event: 1, weird: 0 } })]);
  assert.equal(r.length, 3);
  const sum = r.reduce((a, x) => a + x.pct, 0);
  assert.ok(Math.abs(sum - 100) < 0.11);
  assert.equal(incomeShares([s('2026-10', 1, { income_by_source: { zzz: 5 } })])[0].label, '其他');
  assert.deepEqual(incomeShares([s('2026-10', 1)]), []);
});

test('salonByPeriod: oldest first', () => {
  const r = salonByPeriod([s('2026-10', 1, { salon_income: 7 }), s('2026-09', 1, { salon_income: 3 })]);
  assert.deepEqual(r, [{ label: '2026-09', amount: 3 }, { label: '2026-10', amount: 7 }]);
});

test('expenseGroups: unknown keys fold into 其他 so total is preserved', () => {
  const r = expenseGroups([s('2026-10', 1, { expense_by_group: { 交通與車輛: 10, 神秘: 7, 其他: 1 } })]);
  assert.equal(r[4].amount, 8);
  assert.equal(r.reduce((a, x) => a + x.amount, 0), 18);
});
