import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIncomeWrite, monthlyCapWarning, allocationLines } from './income.ts';
import type { FundAccount, FundStorage, FundMember, FundHandler } from '../fund.ts';
import type { Refs } from './api.ts';

const main: FundAccount = { id: 1, name: '不凍結零用金', kind: 'main', default_storage_id: 10, active: true, sort_order: 1 };
const kitchen: FundAccount = { id: 5, name: '廚房', kind: 'group', default_storage_id: 11, active: true, sort_order: 5 };
const post: FundStorage = { id: 10, name: '郵局', active: true, sort_order: 1 };
const cash: FundStorage = { id: 11, name: '現金', active: true, sort_order: 2 };
const refs = { accounts: [main, kitchen], storages: [post, cash] } as unknown as Refs;
const mem: FundMember = { id: 7, nickname: '小明', real_name: null, role: '巢穴人', default_last5: '12345', active: true, sort_order: 1, joined_at: null, left_at: null, exit_note: null };
const hnd: FundHandler = { id: 2, name: '阿美', active: true, sort_order: 1 };
const base = { date: '2026-11-05', method: 'transfer' as const, storage: post, allocations: [], months: ['2026-11'], refs, seq: 3 };

test('allocationLines: allocations + remainder to main', () => {
  const r = allocationLines(3000, [{ accountId: 5, amount: 1000 }], post, refs);
  assert.deepEqual(r.lines, [
    { account_id: 5, storage_id: 10, amount: 1000 },
    { account_id: 1, storage_id: 10, amount: 2000 },
  ]);
  assert.equal(r.remainder, 2000);
});
test('allocationLines: over-allocation throws; zero allocations dropped', () => {
  assert.throws(() => allocationLines(500, [{ accountId: 5, amount: 600 }], post, refs));
  const r = allocationLines(500, [{ accountId: 5, amount: 0 }], post, refs);
  assert.equal(r.lines.length, 1);
});
test('donation with kitchen allocation → two lines + sub', () => {
  const w = buildIncomeWrite({ ...base, source: 'donation', amount: 3000, member: mem, last5: '12345', allocations: [{ accountId: 5, amount: 1000 }], message: 'hi' });
  assert.equal(w.tx.type, 'donation');
  assert.equal(w.tx.income_source, 'donation');
  assert.equal(w.tx.amount, 3000);
  assert.equal(w.lines.length, 2);
  assert.equal(w.lines.reduce((s, l) => s + l.amount, 0), 3000);
  assert.equal(w.sub?.table, 'fund_donations');
  assert.deepEqual(w.sub?.row, { member_id: 7, payer_member_id: null, payment_method: 'transfer', last5: '12345', handler_id: null, months: ['2026-11'], message: 'hi' });
  assert.match(w.tx.title, /小明/);
});
test('cash donation records handler, no last5', () => {
  const w = buildIncomeWrite({ ...base, source: 'donation', amount: 1500, member: mem, method: 'cash', handler: hnd, storage: cash });
  assert.equal(w.sub?.row.handler_id, 2);
  assert.equal(w.sub?.row.last5, null);
  assert.match(w.tx.voucher ?? '', /阿美/);
});
test('salon → income, one line, no sub', () => {
  const w = buildIncomeWrite({ ...base, source: 'salon', amount: 800, description: '十月沙龍' });
  assert.equal(w.tx.type, 'income'); assert.equal(w.tx.income_source, 'salon');
  assert.equal(w.lines.length, 1); assert.equal(w.sub, undefined);
});
test('donation without member falls back to income', () => {
  const w = buildIncomeWrite({ ...base, source: 'donation', amount: 100 });
  assert.equal(w.tx.type, 'income'); assert.equal(w.sub, undefined);
});
test('reinject → refund', () => {
  const w = buildIncomeWrite({ ...base, source: 'reinject', amount: 300, description: '廚房餘款' });
  assert.equal(w.tx.type, 'refund'); assert.equal(w.tx.income_source, 'reinject');
});
test('loan → loan tx + fund_loans sub', () => {
  const w = buildIncomeWrite({ ...base, source: 'loan', amount: 5000, member: mem });
  assert.equal(w.tx.type, 'loan');
  assert.equal(w.sub?.table, 'fund_loans');
  assert.deepEqual(w.sub?.row, { lender_name: '小明', lender_member_id: 7, principal: 5000, started_on: '2026-11-05', status: 'open' });
  const w2 = buildIncomeWrite({ ...base, source: 'loan', amount: 100, description: '朋友' });
  assert.equal(w2.sub?.row.lender_name, '朋友'); assert.equal(w2.sub?.row.lender_member_id, null);
});

test('non-donation message goes to tx.comment', () => {
  const w = buildIncomeWrite({ ...base, source: 'salon', amount: 800, message: ' 謝謝 ' });
  assert.equal(w.tx.comment, '謝謝');
  const d = buildIncomeWrite({ ...base, source: 'donation', amount: 800, member: mem, message: 'hi' });
  assert.equal(d.tx.comment, undefined);
});

const ex = [
  { member_id: 7, months: ['2026-11'], amount: 4000 },
  { member_id: 7, months: ['2026-10'], amount: 9000 },
  { member_id: 8, months: ['2026-11'], amount: 9000 },
];
test('monthlyCapWarning single month', () => {
  assert.equal(monthlyCapWarning({ id: 7 }, ['2026-11'], ex, 1500, 5000), '11月累計 5500，超過章程單月上限 5000（僅提醒）');
  assert.equal(monthlyCapWarning({ id: 7 }, ['2026-11'], ex, 1000, 5000), null);
  assert.equal(monthlyCapWarning({ id: 7 }, ['2026-12'], ex, 1000, 5000), null);
});
test('monthlyCapWarning splits across months, names first offender', () => {
  // 3000 over 10+11 -> 1500 each; Oct 9000+1500 over, Nov 5500 over -> Oct first
  assert.match(monthlyCapWarning({ id: 7 }, ['2026-11', '2026-10'], ex, 3000, 5000)!, /^10月累計 10500/);
  // 2000 over 11+12 -> 1000 each; Nov 5000 not over, Dec fine
  assert.equal(monthlyCapWarning({ id: 7 }, ['2026-11', '2026-12'], ex, 2000, 5000), null);
  // 2400 over 11+12 -> 1200: Nov 5200 over
  assert.match(monthlyCapWarning({ id: 7 }, ['2026-11', '2026-12'], ex, 2400, 5000)!, /^11月累計 5200/);
});

test('monthlyCapWarning spreads prior multi-month donations evenly', () => {
  const prior = [{ member_id: 7, months: ['2026-11', '2026-12'], amount: 3000 }];
  assert.equal(monthlyCapWarning({ id: 7 }, ['2026-11'], prior, 1500, 5000), null);
  assert.match(monthlyCapWarning({ id: 7 }, ['2026-11'], prior, 1500, 2500)!, /^11月累計 3000/);
});
