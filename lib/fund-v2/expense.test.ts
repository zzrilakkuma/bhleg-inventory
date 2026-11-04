import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingRecurring, guessTags, buildExpenseWrite, expenseImpact, buildGroupSummaryWrite,
} from './expense.ts';
import type { FundTemplate, FundExpense, FundAccount, FundStorage, FundAdvancer } from '../fund.ts';
import type { Refs } from './api.ts';

const tpl = (o: Partial<FundTemplate>): FundTemplate => ({
  id: 1, name: '電費', kind: 'expense', vendor: '台電', description: 'N月電費', tags: [], storage_name: null,
  advancer_name: null, default_amount: null, active: true, sort_order: 1, recurring: true, due_day: null, ...o,
});
const exp = (o: Partial<FundExpense>): FundExpense => ({
  id: 1, transaction_id: 1, vendor: '好市多', description: null, voucher_no: null, tags: [], advancer_id: null,
  settled: false, claim_status: 'none', claimed_transaction_id: null, claimed_on: null, ...o,
});
const main: FundAccount = { id: 1, name: '不凍結零用金', kind: 'main', default_storage_id: 10, active: true, sort_order: 1 };
const grp: FundAccount = { id: 5, name: '廚房', kind: 'group', default_storage_id: 11, active: true, sort_order: 5 };
const post: FundStorage = { id: 10, name: '郵局', active: true, sort_order: 1 };
const cash: FundStorage = { id: 11, name: '現金袋', active: true, sort_order: 2 };
const adv: FundAdvancer = { id: 3, name: '中央蘭室', active: true, sort_order: 1, member_id: null };
const refs = { accounts: [main, grp], storages: [post, cash], advancers: [adv] } as unknown as Refs;

test('pendingRecurring excludes templates already booked this month', () => {
  const ts = [tpl({ id: 1, vendor: '台電' }), tpl({ id: 2, vendor: '停車場' }), tpl({ id: 3, vendor: '電信', recurring: false }), tpl({ id: 4, vendor: '台電', active: false })];
  const r = pendingRecurring(ts, [{ vendor: '台電', occurred_on: '2026-11-03' }], '2026-11');
  assert.deepEqual(r.map((t) => t.id), [2]);
});
test('pendingRecurring ignores other-month expenses', () => {
  const r = pendingRecurring([tpl({})], [{ vendor: '台電', occurred_on: '2026-10-03' }], '2026-11');
  assert.equal(r.length, 1);
});

test('guessTags: template > last expense > []', () => {
  assert.deepEqual(guessTags('x', exp({ tags: ['a'] }), tpl({ tags: ['t'] })), ['t']);
  assert.deepEqual(guessTags('x', exp({ tags: ['a'] }), tpl({ tags: [] })), ['a']);
  assert.deepEqual(guessTags('x', undefined, undefined), []);
});

const base = { amount: 1980, vendor: '好市多', description: '狗飼料', date: '2026-11-05', accountId: 1, tags: ['狗飼料'], refs, seq: 2 };

test('buildExpenseWrite advancer: off ledger, no lines, unclaimed', () => {
  const w = buildExpenseWrite({ ...base, advancer: adv });
  assert.equal(w.tx.off_ledger, true);
  assert.deepEqual(w.lines, []);
  assert.equal(w.sub.row.claim_status, 'unclaimed');
  assert.equal(w.sub.row.advancer_id, 3);
  assert.equal(w.tx.type, 'expense');
  assert.equal(w.tx.amount, -1980);
  assert.equal(w.tx.seq, 2);
  assert.equal(expenseImpact(w), 0);
});
test('buildExpenseWrite non-advancer: one negative line, claim none', () => {
  const w = buildExpenseWrite({ ...base, storage: post });
  assert.equal(w.tx.off_ledger, false);
  assert.deepEqual(w.lines, [{ account_id: 1, storage_id: 10, amount: -1980 }]);
  assert.equal(w.sub.row.claim_status, 'none');
  assert.equal(w.sub.row.advancer_id, null);
  assert.ok(w.tx.title.includes('【好市多】'));
  assert.equal(expenseImpact(w), -1980);
});
test('buildExpenseWrite: non-main account impact is 0 for main balance', () => {
  const w = buildExpenseWrite({ ...base, accountId: 5, storage: cash });
  assert.equal(expenseImpact(w, 1), 0);
});

test('buildGroupSummaryWrite: lines negative at group account/default storage', () => {
  const w = buildGroupSummaryWrite({ groupAccountId: 5, month: '2026-11', items: [{ desc: '菜', amount: 300 }, { desc: '米', amount: 200 }], refs, date: '2026-11-30' });
  assert.equal(w.tx.type, 'group_summary');
  assert.equal(w.tx.title, '廚房 11月 彙整');
  assert.equal(w.tx.group_id, 5);
  assert.equal(w.tx.amount, -500);
  assert.deepEqual(w.lines.map((l) => [l.account_id, l.storage_id, l.amount]), [[5, 11, -300], [5, 11, -200]]);
});

import { waiveClaims } from './expense.ts';
test('waiveClaims updates only claim_status for unclaimed rows', async () => {
  const calls: unknown[] = [];
  const q: any = {
    update: (p: unknown) => { calls.push(['update', p]); return q; },
    in: (c: string, v: unknown) => { calls.push(['in', c, v]); return q; },
    eq: (c: string, v: unknown) => { calls.push(['eq', c, v]); return Promise.resolve({ error: null }); },
  };
  await waiveClaims({ from: (t) => { calls.push(['from', t]); return q; } }, [4, 5]);
  assert.deepEqual(calls, [['from', 'fund_expenses'], ['update', { claim_status: 'waived' }], ['in', 'transaction_id', [4, 5]], ['eq', 'claim_status', 'unclaimed']]);
});
