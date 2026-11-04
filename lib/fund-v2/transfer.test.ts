import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotsFrom, buildTransferWrite, validateTransfer, afterTransfer, type Slot } from './transfer.ts';
import type { FundAccount, FundStorage } from '../fund.ts';
import type { Refs, Snapshot } from './api.ts';

const acc = (id: number, name: string, kind: FundAccount['kind'], st: number | null, active = true): FundAccount =>
  ({ id, name, kind, default_storage_id: st, active, sort_order: id });
const st = (id: number, name: string, active = true): FundStorage => ({ id, name, active, sort_order: id });
const refs = {
  accounts: [
    acc(1, '不凍結零用金', 'main', 10), acc(2, '緊急應變備用金', 'reserve', 10), acc(3, '前瞻', 'reserve', null),
    acc(5, '廚房', 'group', 11), acc(6, '沙龍', 'special', 10), acc(8, '停用零', 'special', 11, false),
    acc(7, '代墊（待清償）', 'special', 13),
  ],
  storages: [st(10, '郵局'), st(11, '現金'), st(12, '現金（廚房）'), st(13, '代墊（待清償）'), st(14, '現金（空）')],
} as unknown as Refs;
const snap = (): Snapshot => ({
  transaction_id: 1, ord: 1, occurred_on: '2026-11-05', total: 0, main: 82,
  accounts: { 1: 82, 2: 300, 3: 200, 5: 400, 6: 50, 7: -50 },
  storages: { 10: 54, 11: 400, 12: 100, 13: -50, 14: 0 },
});
const S = (id: number, label: string, balance: number): Slot => ({ kind: 'storage', id, label, balance });
const A = (id: number, label: string, balance: number, accountKind: Slot['accountKind']): Slot => ({ kind: 'account', id, label, balance, accountKind });
const post = S(10, '郵局', 54), cash = S(11, '現金', 400);
const emerg = A(2, '緊急應變備用金', 300, 'reserve'), kitchen = A(5, '廚房', 400, 'group'), salon = A(6, '沙龍', 50, 'special');
const tot = (l: { amount: number }[]) => l.reduce((s, x) => s + x.amount, 0);

test('slotsFrom: storage chips (郵局/現金/nonzero bags) and account chips; totals from snapshot', () => {
  const s = slotsFrom(snap(), refs);
  assert.deepEqual(s.map((x) => `${x.kind}/${x.id}/${x.label}/${x.balance}/${x.accountKind ?? ''}`), [
    'storage/10/郵局/54/', 'storage/11/現金/400/', 'storage/12/現金（廚房）/100/',
    'account/2/緊急應變備用金/300/reserve', 'account/3/前瞻/200/reserve', 'account/5/廚房/400/group', 'account/6/沙龍/50/special',
  ]);
});
test('slotsFrom: excludes 待清償, zero bags, zero inactive; null snapshot → zeros', () => {
  const s = slotsFrom(snap(), refs);
  assert.ok(!s.some((x) => x.label.includes('待清償') || x.id === 14 && x.kind === 'storage' || x.id === 8 && x.kind === 'account'));
  assert.ok(slotsFrom(null, refs).every((x) => x.balance === 0));
});
test('storage→storage: main at both storages', () => {
  const w = buildTransferWrite(post, cash, 100, '2026-11-05', refs, undefined, 4);
  assert.deepEqual(w.lines, [{ account_id: 1, storage_id: 10, amount: -100 }, { account_id: 1, storage_id: 11, amount: 100 }]);
  assert.equal(tot(w.lines), 0);
  assert.equal(w.tx.type, 'transfer'); assert.equal(w.tx.amount, 0); assert.equal(w.tx.decision_ref, null);
  assert.equal(w.tx.seq, 4); assert.equal(w.tx.title, '【轉帳】郵局 → 現金');
});
test('storage→account (main→reserve): main and account at the from-storage', () => {
  const w = buildTransferWrite(post, emerg, 20, '2026-11-05', refs);
  assert.deepEqual(w.lines, [{ account_id: 1, storage_id: 10, amount: -20 }, { account_id: 2, storage_id: 10, amount: 20 }]);
});
test('account→storage (reserve→main): account and main at the to-storage; decision_ref kept', () => {
  const w = buildTransferWrite(emerg, cash, 20, '2026-11-05', refs, ' 第3次 ');
  assert.deepEqual(w.lines, [{ account_id: 2, storage_id: 11, amount: -20 }, { account_id: 1, storage_id: 11, amount: 20 }]);
  assert.equal(w.tx.decision_ref, '第3次');
});
test('account→account: each at its default storage (郵局 when null)', () => {
  const w = buildTransferWrite(kitchen, salon, 30, '2026-11-05', refs);
  assert.deepEqual(w.lines, [{ account_id: 5, storage_id: 11, amount: -30 }, { account_id: 6, storage_id: 10, amount: 30 }]);
  const w2 = buildTransferWrite(A(3, '前瞻', 200, 'reserve'), kitchen, 5, '2026-11-05', refs);
  assert.equal(w2.lines[0].storage_id, 10);
  assert.equal(tot(w.lines), 0);
});
test('validateTransfer', () => {
  assert.equal(validateTransfer(post, cash, 0, ''), '金額必須大於 0');
  assert.equal(validateTransfer(post, post, 10, ''), '來源與目的相同');
  assert.equal(validateTransfer(post, cash, 55, ''), '來源餘額不足');
  assert.equal(validateTransfer(emerg, cash, 100, ' '), '從緊急應變／前瞻搬出需填依據（第幾次會議）');
  assert.equal(validateTransfer(emerg, cash, 100, '第3次'), null);
  assert.equal(validateTransfer(kitchen, salon, 100, ''), null);
  assert.equal(validateTransfer(post, emerg, 50, ''), null);
  assert.equal(validateTransfer(S(10, 'x', 5), A(10, 'y', 0, 'group'), 1, ''), null); // same id, different kind
});
test('afterTransfer: 郵局→現金 touches storages only (main unchanged)', () => {
  const r = afterTransfer(snap(), buildTransferWrite(post, cash, 20, '2026-11-05', refs), refs);
  assert.deepEqual(r, [{ label: '郵局', before: 54, after: 34 }, { label: '現金', before: 400, after: 420 }]);
});
test('afterTransfer: 郵局→緊急應變 shows storage, account and main change', () => {
  const r = afterTransfer(snap(), buildTransferWrite(post, emerg, 20, '2026-11-05', refs), refs);
  assert.deepEqual(r, [
    { label: '郵局', before: 54, after: 54 }, { label: '緊急應變備用金', before: 300, after: 320 },
    { label: '不凍結零用金', before: 82, after: 62 },
  ]);
});
test('afterTransfer: 廚房→沙龍 touches both accounts and storages, main unchanged', () => {
  const r = afterTransfer(snap(), buildTransferWrite(kitchen, salon, 30, '2026-11-05', refs), refs);
  assert.deepEqual(r, [
    { label: '現金', before: 400, after: 370 }, { label: '郵局', before: 54, after: 84 },
    { label: '廚房', before: 400, after: 370 }, { label: '沙龍', before: 50, after: 80 },
  ]);
});
