import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEditPatch, groupByDate, rowSummary, pageWindow, categoryOf } from './ledger.ts';
import type { LedgerRow, FundPeriod } from './api.ts';

const row = (o: Partial<LedgerRow>): LedgerRow => ({
  id: 1, ord: 1, type: 'expense', occurred_on: '2026-11-02', seq: 1, title: '停車場月租\n備註', voucher: null, note: null,
  comment: null, amount: 3800, stated_on: null, date_note: null, off_ledger: false, income_source: null,
  decision_ref: null, group_id: null, total: 0, main: 82, accounts: {}, storages: {}, moved: 0, claim_status: null,
  vendor: null, tags: null, member_id: null, ...o,
});
const period = (month: string, start_ord: number, end_ord: number): FundPeriod => ({
  settlement_transaction_id: end_ord, month, period_no: 1, start_ord, end_ord, settled_on: '2026-01-01',
});

test('groupByDate: uses stated_on over occurred_on, keeps order', () => {
  const g = groupByDate([
    row({ id: 3, ord: 3, occurred_on: '2026-11-03' }),
    row({ id: 2, ord: 2, occurred_on: '2026-11-03', stated_on: '2026-11-02' }),
    row({ id: 1, ord: 1, occurred_on: '2026-11-02' }),
  ]);
  assert.deepEqual(g.map((x) => [x.date, x.rows.map((r) => r.id)]), [['2026-11-03', [3]], ['2026-11-02', [2, 1]]]);
});

test('groupByDate: non-contiguous same date yields separate groups', () => {
  const g = groupByDate([
    row({ id: 3, ord: 3, stated_on: '2026-10-12' }),
    row({ id: 2, ord: 2, stated_on: '2026-10-07' }),
    row({ id: 1, ord: 1, stated_on: '2026-10-12' }),
  ]);
  assert.equal(g.length, 3);
  assert.equal(g[0].date, g[2].date);
});

test('rowSummary: donation in, expense out, transfer neutral', () => {
  assert.deepEqual(rowSummary(row({ type: 'donation', title: 'Ruby 奉納', amount: 1500 })), { title: 'Ruby 奉納', amount: 1500, kind: 'in' });
  assert.deepEqual(rowSummary(row({ type: 'expense' })), { title: '停車場月租', amount: 3800, kind: 'out' });
  assert.deepEqual(rowSummary(row({ type: 'transfer', amount: 0, moved: 5000 })), { title: '停車場月租', amount: 5000, kind: 'neutral' });
  assert.equal(rowSummary(row({ type: 'settlement', amount: 99 })).amount, null);
});

test('categoryOf', () => {
  assert.equal(categoryOf(row({ type: 'loan' })), '收入');
  assert.equal(categoryOf(row({ type: 'repayment' })), '支出');
});

test('pageWindow: default newest period to latest ord; period i uses its own end', () => {
  const ps = [period('2026-11', 21, 30), period('2026-10', 11, 20), period('2026-09', 1, 10)];
  assert.deepEqual(pageWindow(ps, 0, 0, 35), { fromOrd: 21, toOrd: 35 });
  assert.deepEqual(pageWindow(ps, 1, 0, 35), { fromOrd: 11, toOrd: 20 });
});
test('pageWindow: loadedMore extends fromOrd, clamped', () => {
  const ps = [period('2026-11', 21, 30), period('2026-10', 11, 20), period('2026-09', 1, 10)];
  assert.deepEqual(pageWindow(ps, 0, 1, 35), { fromOrd: 11, toOrd: 35 });
  assert.deepEqual(pageWindow(ps, 0, 5, 35), { fromOrd: 1, toOrd: 35 });
});
test('pageWindow: no periods -> whole ledger', () => {
  assert.deepEqual(pageWindow([], 0, 0, 7), { fromOrd: 1, toOrd: 7 });
});

test('buildEditPatch: title-only change leaves dates out', () => {
  const o = { title: 'a', date: '2026-10-07', note: '', comment: '' };
  const p = buildEditPatch(o, { ...o, title: 'b' });
  assert.equal('occurred_on' in p, false);
  assert.equal('stated_on' in p, false);
  assert.equal(p.title, 'b');
});
test('buildEditPatch: date change sets both keys', () => {
  const o = { title: 'a', date: '2026-10-07', note: '', comment: '' };
  const p = buildEditPatch(o, { ...o, date: '2026-10-08' });
  assert.equal(p.occurred_on, '2026-10-08');
  assert.equal(p.stated_on, '2026-10-08');
});
