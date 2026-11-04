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
    acc(1, '不凍結零用金', 'main', 10), acc(2, '緊急應變', 'reserve', 10), acc(3, '前瞻', 'reserve', 10),
    acc(5, '廚房', 'group', 11), acc(6, '空科目', 'special', 11, false), acc(7, '代墊（待清償）', 'special', 13),
  ],
  storages: [st(10, '郵局'), st(11, '現金'), st(12, '現金（廚房）'), st(13, '代墊（待清償）'), st(14, '保險箱')],
} as unknown as Refs;
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({
  transaction_id: 1, ord: 1, occurred_on: '2026-11-05', total: 0, main: 0,
  accounts: { 1: 500, 2: 300, 3: 200, 5: 400, 6: 0, 7: -50 },
  storages: { 10: 1000, 11: 400, 12: 100, 13: -50, 14: 0 }, ...o,
});

test('slotsFrom: main per storage (郵局/現金 + nonzero others), reserves/groups at default storage', () => {
  const s = slotsFrom(snap({ storages: { 10: 1000, 11: 400, 12: 100, 13: -50, 14: 25 } }), refs);
  const keys = s.map((x) => `${x.accountId}/${x.storageId}/${x.label}/${x.balance}/${x.kind}`);
  assert.deepEqual(keys, [
    '1/10/郵局/500/main', // 1000 - 300 - 200
    '1/11/現金/0/main',   // 400 - 400 (廚房)
    '1/14/保險箱/25/main',
    '2/10/緊急應變/300/reserve',
    '3/10/前瞻/200/reserve',
    '5/11/廚房/400/group',
  ]);
});
test('slotsFrom: excludes 待清償 and group bags and zero inactive accounts', () => {
  const s = slotsFrom(snap(), refs);
  assert.ok(!s.some((x) => x.accountId === 7 || x.storageId === 13 || x.storageId === 12 || x.accountId === 6));
});
test('slotsFrom: no snapshot → zero balances', () => {
  const s = slotsFrom(null, refs);
  assert.ok(s.every((x) => x.balance === 0));
});
test('buildTransferWrite: two lines net 0, type transfer', () => {
  const [post, cash] = [{ accountId: 1, storageId: 10, label: '郵局', balance: 500, kind: 'main' }, { accountId: 1, storageId: 11, label: '現金', balance: 0, kind: 'main' }] as Slot[];
  const w = buildTransferWrite(post, cash, 100, '2026-11-05', undefined, 4);
  assert.deepEqual(w.lines, [{ account_id: 1, storage_id: 10, amount: -100 }, { account_id: 1, storage_id: 11, amount: 100 }]);
  assert.equal(w.lines.reduce((s, l) => s + l.amount, 0), 0);
  assert.equal(w.tx.type, 'transfer'); assert.equal(w.tx.amount, 0); assert.equal(w.tx.decision_ref, null);
  assert.equal(w.tx.seq, 4); assert.equal(w.tx.title, '【轉帳】郵局 → 現金');
  assert.equal(buildTransferWrite(post, cash, 100, '2026-11-05', '第3次').tx.decision_ref, '第3次');
});
const A: Slot = { accountId: 1, storageId: 10, label: '郵局', balance: 500, kind: 'main' };
const B: Slot = { accountId: 1, storageId: 11, label: '現金', balance: 0, kind: 'main' };
const R: Slot = { accountId: 2, storageId: 10, label: '緊急應變', balance: 300, kind: 'reserve' };
test('validateTransfer', () => {
  assert.equal(validateTransfer(A, B, 0, ''), '金額必須大於 0');
  assert.equal(validateTransfer(A, A, 10, ''), '來源與目的相同');
  assert.equal(validateTransfer(A, B, 501, ''), '來源餘額不足');
  assert.equal(validateTransfer(R, A, 100, ''), '從緊急應變／前瞻搬出需填依據（第幾次會議）');
  assert.equal(validateTransfer(R, A, 100, '  '), '從緊急應變／前瞻搬出需填依據（第幾次會議）');
  assert.equal(validateTransfer(R, A, 100, '第3次'), null);
  assert.equal(validateTransfer(A, B, 500, ''), null);
});
test('afterTransfer: 郵局→現金 leaves main unchanged; shows storages only', () => {
  const w = buildTransferWrite(A, B, 100, '2026-11-05');
  const r = afterTransfer(snap({ main: 82 }), w, refs);
  assert.deepEqual(r, [{ label: '郵局', before: 1000, after: 900 }, { label: '現金', before: 400, after: 500 }]);
});
test('afterTransfer: main→reserve shows storages, reserve account and main change', () => {
  const w = buildTransferWrite(A, R, 100, '2026-11-05');
  const r = afterTransfer(snap({ main: 82 }), w, refs);
  assert.deepEqual(r, [
    { label: '郵局', before: 1000, after: 1000 },
    { label: '緊急應變', before: 300, after: 400 },
    { label: '不凍結零用金', before: 82, after: -18 },
  ]);
});
