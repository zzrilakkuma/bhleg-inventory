import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpaidMembers, duePayables, todoItems, unpaidListText } from './todo.ts';
import type { FundMember } from '../fund.ts';

const m = (id: number, nickname: string, active = true): FundMember =>
  ({ id, nickname, real_name: null, role: null, default_last5: null, active, sort_order: id, joined_at: null, left_at: null, exit_note: null, user_id: null });
const members = [m(1, 'A'), m(2, 'B'), m(3, 'C'), m(4, 'D', false)];

test('unpaidMembers: empty on or before due day', () => {
  assert.deepEqual(unpaidMembers(members, [], new Date(2026, 10, 14), 14), []);
  assert.deepEqual(unpaidMembers(members, [], new Date(2026, 10, 5), 14), []);
});
test('unpaidMembers: 2 月截止日 31 → 月底 28 日當天不算逾期、之後才算', () => {
  assert.deepEqual(unpaidMembers(members, [], new Date(2026, 1, 28), 31), []);
  assert.ok(unpaidMembers(members, [], new Date(2027, 1, 28), 27).length > 0);
});
test('unpaidMembers: after due day lists active members without donation this month', () => {
  const don = [{ member_id: 1, months: ['2026-11'] }, { member_id: 2, months: ['2026-10'] }];
  const r = unpaidMembers(members, don, new Date(2026, 10, 15), 14);
  assert.deepEqual(r.map((x) => x.nickname), ['B', 'C']);
});
test('duePayables: overdue flag and order (nulls last)', () => {
  const p = [
    { id: 1, title: 'x', amount: 1, due_on: null },
    { id: 2, title: 'y', amount: 2, due_on: '2026-11-20' },
    { id: 3, title: '電費', amount: 3, due_on: '2026-11-01' },
  ];
  const r = duePayables(p, new Date(2026, 10, 5));
  assert.deepEqual(r.map((x) => [x.payable.id, x.overdue]), [[3, true], [2, false], [1, false]]);
  assert.equal(duePayables([{ id: 9, title: 't', amount: 1, due_on: '2026-11-05' }], new Date(2026, 10, 5))[0].overdue, false);
});
test('todoItems: kinds and empty', () => {
  assert.deepEqual(todoItems({ payables: [], unclaimed: [], unpaid: [] }), []);
  const items = todoItems({
    payables: [{ payable: { id: 3, title: '電費', amount: 3, due_on: '2026-11-01' }, overdue: true }],
    unclaimed: [{ amount: 100 }, { amount: 98 }],
    unpaid: [m(2, 'B')],
  });
  assert.equal(items.length, 3);
  assert.deepEqual(items[1], { kind: 'unclaimed', count: 2, sum: 198 });
  assert.deepEqual(items[2], { kind: 'unpaid', count: 1 });
});
test('unpaidListText', () => {
  assert.equal(unpaidListText([m(2, 'B'), m(3, 'C')], '2026-11'), '11月 尚未奉納：B、C');
});

test('unpaidMembers 不列出尚未加入與已退出者', () => {
  const D = (o: Partial<FundMember>) => ({ ...m(0, ''), ...o });
  const ms = [
    D({ id: 1, nickname: 'A' }), D({ id: 2, nickname: 'B', joined_at: '2026-12-01' }),
    D({ id: 3, nickname: 'C', left_at: '2026-10-31', active: false }),
  ];
  const out = unpaidMembers(ms, [], new Date(2026, 10, 20), 14);
  assert.deepEqual(out.map((x) => x.nickname), ['A']);
});
