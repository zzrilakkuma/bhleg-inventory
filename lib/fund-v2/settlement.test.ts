import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaimWrites, buildRepaymentWrites, computeFreeze, buildSettlementWrite, nextPeriod, lateDays,
  publishText, applyLines, step1Delta,
} from './settlement.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import type { FundAccount, FundStorage } from '../fund.ts';
import type { Refs, Snapshot, UnclaimedExpense, OutstandingLoan } from './api.ts';

const acc = (id: number, name: string, kind: FundAccount['kind'], st: number | null): FundAccount =>
  ({ id, name, kind, default_storage_id: st, active: true, sort_order: id });
const st = (id: number, name: string): FundStorage => ({ id, name, active: true, sort_order: id });
const refs = {
  accounts: [acc(1, '不凍結零用金', 'main', 10), acc(2, '緊急應變備用金', 'reserve', 10), acc(3, '共存前瞻預算', 'reserve', 10)],
  storages: [st(10, '郵局'), st(11, '現金')],
} as unknown as Refs;
const settings = { ...DEFAULT_SETTINGS };
const snap = (): Snapshot => ({
  transaction_id: 1, ord: 1, occurred_on: '2026-11-05', total: 9664, main: 8664,
  accounts: { 1: 8664, 2: 600, 3: 400 }, storages: { 10: 9000, 11: 664 },
});
const exp = (id: number, vendor: string, amount: number): UnclaimedExpense =>
  ({ transaction_id: id, advancer_id: 1, vendor, tags: [], occurred_on: '2026-10-12', stated_on: null, title: `【${vendor}】`, amount });
const loan = (id: number, name: string, remaining: number): OutstandingLoan =>
  ({ loan_id: id, lender_name: name, lender_member_id: null, principal: 10000, repaid: 10000 - remaining, remaining, status: 'open' });
const post = refs.storages[0];

test('computeFreeze: 8664 → 2599/2599; 0 or negative → 0/0', () => {
  assert.deepEqual(computeFreeze(8664, settings), { base: 8664, reserve: 2599, future: 2599 });
  assert.deepEqual(computeFreeze(0, settings), { base: 0, reserve: 0, future: 0 });
  assert.deepEqual(computeFreeze(-50, settings), { base: -50, reserve: 0, future: 0 });
  assert.deepEqual(computeFreeze(1000, settings), { base: 1000, reserve: 300, future: 300 });
});
test('computeFreeze: freeze_base total 以總餘款為基準；沒給 total 則退回零用金', () => {
  const t = { ...settings, freeze_base: 'total' as const };
  assert.deepEqual(computeFreeze(1000, t, 20000), { base: 20000, reserve: 6000, future: 6000 });
  assert.deepEqual(computeFreeze(1000, t), { base: 1000, reserve: 300, future: 300 });
});

test('buildClaimWrites: one expense_claim tx, lines sum = selected sum, one line per expense', () => {
  const w = buildClaimWrites([exp(544, '狗飼料', -1980), exp(545, '瓦斯', -1200)], '2026-11-05', post, refs, 3)!;
  assert.equal(w.tx.type, 'expense_claim');
  assert.equal(w.tx.title, '代墊請款（2 筆）');
  assert.equal(w.tx.amount, -3180);
  assert.equal(w.tx.seq, 3);
  assert.equal(w.tx.occurred_on, '2026-11-05');
  assert.deepEqual(w.lines, [
    { account_id: 1, storage_id: 10, amount: -1980, label: '狗飼料' },
    { account_id: 1, storage_id: 10, amount: -1200, label: '瓦斯' },
  ]);
  assert.equal(w.lines.reduce((s, l) => s + l.amount, 0), w.tx.amount);
  assert.deepEqual(w.claimedExpenseIds, [544, 545]);
  assert.equal(buildClaimWrites([], '2026-11-05', post, refs), null);
});

test('buildRepaymentWrites: only amount > 0; line −(amount+fee); sub fund_repayments', () => {
  const w = buildRepaymentWrites([
    { loan: loan(7, '阿明', 5000), amount: 1000, fee: 15 },
    { loan: loan(8, '小華', 3000), amount: 0, fee: 0 },
  ], '2026-11-05', post, refs, 4);
  assert.equal(w.length, 1);
  assert.equal(w[0].tx.type, 'repayment');
  assert.equal(w[0].tx.amount, -1015);
  assert.equal(w[0].tx.seq, 4);
  assert.match(w[0].tx.title, /償還阿明/);
  assert.deepEqual(w[0].lines, [{ account_id: 1, storage_id: 10, amount: -1015 }]);
  assert.deepEqual(w[0].sub, { table: 'fund_repayments', row: { loan_id: 7, amount: 1000, fee: 15 } });
  const w2 = buildRepaymentWrites([{ loan: loan(7, 'a', 5000), amount: 1, fee: 0 }, { loan: loan(9, 'b', 5000), amount: 2, fee: 0 }], '2026-11-05', post, refs, 6);
  assert.deepEqual(w2.map((x) => x.tx.seq), [6, 7]);
});

test('step1Delta: expenses + repayments (with fee)', () => {
  assert.equal(step1Delta([exp(1, 'a', -100), exp(2, 'b', -50)], [{ amount: 200, fee: 10 }, { amount: 0, fee: 5 }]), -360);
});

const base = (over: Partial<Parameters<typeof buildSettlementWrite>[0]> = {}) => buildSettlementWrite({
  month: '2026-11', periodNo: 1, date: '2026-11-25', seq: 2, freeze: { base: 8664, reserve: 2599, future: 2599 },
  mainBefore: 8664, system: { post: 9000, cash: 664 }, actual: { post: 9000, cash: 664 },
  repayments: [], refs, settings, ...over,
});

test('buildSettlementWrite: freeze lines main→reserve at 郵局, sub row, texts', () => {
  const w = base();
  assert.equal(w.tx.type, 'settlement');
  assert.equal(w.tx.amount, 0);
  assert.equal(w.tx.seq, 2);
  assert.equal(w.tx.title, '***11月結算***');
  assert.deepEqual(w.lines, [
    { account_id: 1, storage_id: 10, amount: -2599, label: '凍存' },
    { account_id: 2, storage_id: 10, amount: 2599, label: '凍存' },
    { account_id: 1, storage_id: 10, amount: -2599, label: '凍存' },
    { account_id: 3, storage_id: 10, amount: 2599, label: '凍存' },
  ]);
  assert.deepEqual(w.sub.row, {
    month: '2026-11', period_no: 1, freeze_base: 8664, frozen_reserve: 2599, frozen_future: 2599, zero_reason: null,
    system_post: 9000, system_cash: 664, actual_post: 9000, actual_cash: 664, late_days: 5,
  });
  assert.equal(w.sub.table, 'fund_settlements');
  assert.match(w.tx.note!, /#不凍結零用金預留3466元/);
  assert.equal(w.leftover, 3466);
});

test('buildSettlementWrite: corrections become 矯正回歸 on main at that storage; leftover includes them', () => {
  const w = base({ actual: { post: 8990, cash: 700 } });
  assert.deepEqual(w.lines.slice(4), [
    { account_id: 1, storage_id: 10, amount: -10, label: '矯正回歸' },
    { account_id: 1, storage_id: 11, amount: 36, label: '矯正回歸' },
  ]);
  assert.equal(w.leftover, 3466 + 26);
  assert.equal(w.sub.row.actual_post, 8990);
});

test('buildSettlementWrite: frozen 0 → no freeze lines; zero_reason required', () => {
  const zero = { base: 0, reserve: 0, future: 0 };
  assert.throws(() => base({ freeze: zero, mainBefore: 0 }), /原因/);
  assert.throws(() => base({ freeze: zero, mainBefore: 0, zeroReason: '  ' }), /原因/);
  const w = base({ freeze: zero, mainBefore: 0, zeroReason: '因餘款不足' });
  assert.deepEqual(w.lines, []);
  assert.equal(w.sub.row.zero_reason, '因餘款不足');
  assert.match(w.tx.note!, /#因餘款不足/);
});

test('buildSettlementWrite: one reserve > 0 → only those two lines, zero_reason null', () => {
  const w = base({ freeze: { base: 8664, reserve: 1000, future: 0 }, zeroReason: 'x' });
  assert.equal(w.lines.length, 2);
  assert.equal(w.sub.row.zero_reason, null);
});

test('buildSettlementWrite: repayments listed in note', () => {
  const w = base({ repayments: [{ lender: '阿明', amount: 1000, fee: 15, remaining: 4000 }] });
  assert.match(w.tx.note!, /阿明借款 剩餘4000元 尚待償還/);
});

test('lateDays', () => {
  assert.equal(lateDays('2026-10', '2026-11-03', 20), 14);
  assert.equal(lateDays('2026-11', '2026-11-20', 20), 0);
  assert.equal(lateDays('2026-11', '2026-11-05', 20), 0);
  assert.equal(lateDays('2026-12', '2027-01-02', 20), 13);
  // 截止日 31、2 月只有 28 天 → 以 2/28 計
  assert.equal(lateDays('2026-02', '2026-03-02', 31), 2);
  assert.equal(lateDays('2026-02', '2026-02-28', 31), 0);
});

test('nextPeriod: same month → count + 1', () => {
  const p = (month: string) => ({ settlement_transaction_id: 1, month, period_no: 1, start_ord: 1, end_ord: 2, settled_on: '2026-11-01' });
  assert.equal(nextPeriod([], '2026-11'), 1);
  assert.equal(nextPeriod([p('2026-10')], '2026-11'), 1);
  assert.equal(nextPeriod([p('2026-11'), p('2026-10')], '2026-11'), 2);
});

test('applyLines: updates accounts, storages, total, main', () => {
  const s = applyLines(snap(), [{ account_id: 1, storage_id: 10, amount: -100 }, { account_id: 2, storage_id: 10, amount: 100 }, { account_id: 1, storage_id: 11, amount: 5 }], refs);
  assert.equal(s.main, 8569);
  assert.equal(s.accounts[2], 700);
  assert.equal(s.storages[10], 9000);
  assert.equal(s.storages[11], 669);
  assert.equal(s.total, 9669);
});

test('publishText: first line ***N月結算***, then date, then snapshot', () => {
  const t = publishText(snap(), refs, '2026-11', '2026-11-25');
  const lines = t.split('\n');
  assert.equal(lines[0], '***11月結算***');
  assert.equal(lines[1], '2026/11/25');
  assert.equal(lines[2], '不凍結零用金：8664');
  assert.equal(lines[lines.length - 1], '小結：9664');
});
