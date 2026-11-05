import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canChange, roleErrorText, roleRows, setRole, type RoleRow } from './roles.ts';

const rows: RoleRow[] = [
  { member_id: 1, nickname: 'S', user_id: 'u1', role: 'accountant' },
  { member_id: 2, nickname: 'E', user_id: 'u2', role: 'accountant' },
  { member_id: 3, nickname: 'X', user_id: null, role: 'member' },
  { member_id: 4, nickname: 'Y', user_id: 'u4', role: 'member' },
];
test('canChange', () => {
  assert.deepEqual(canChange(rows[2], 'accountant', rows, 'u1'), { ok: false, reason: '這位成員還沒有登入帳號' });
  assert.deepEqual(canChange(rows[0], 'member', rows, 'u1'), { ok: false, reason: '不能移除自己的會計權限，請由另一位會計操作' });
  assert.equal(canChange(rows[1], 'member', rows, 'u1').ok, true);
  assert.deepEqual(canChange(rows[1], 'member', [rows[1], rows[3]], 'u9'), { ok: false, reason: '至少要保留一位會計' });
  assert.equal(canChange(rows[3], 'accountant', rows, 'u1').ok, true);
});
test('canChange: selfUserId 為空時一律拒絕', () => {
  const r = { ok: false, reason: '無法確認目前登入的帳號，請重新整理' };
  assert.deepEqual(canChange(rows[1], 'member', rows, ''), r);
  assert.deepEqual(canChange(rows[3], 'accountant', rows, ''), r);
});
test('canChange: 兩位成員共用同一 user_id 只算一位會計', () => {
  const shared: RoleRow[] = [
    { member_id: 1, nickname: 'A', user_id: 'u2', role: 'accountant' },
    { member_id: 2, nickname: 'B', user_id: 'u2', role: 'accountant' },
  ];
  assert.deepEqual(canChange(shared[0], 'member', shared, 'u9'), { ok: false, reason: '至少要保留一位會計' });
});
test('roleRows 合併成員與角色、略過停用成員', () => {
  const out = roleRows(
    [{ id: 1, nickname: 'S', user_id: 'u1', active: true }, { id: 2, nickname: 'Z', user_id: 'u2', active: false }, { id: 3, nickname: 'X', user_id: null, active: true }],
    [{ user_id: 'u1', role: 'accountant' }]);
  assert.deepEqual(out.map((r) => [r.nickname, r.role]), [['S', 'accountant'], ['X', 'member']]);
  assert.equal(out[0].exited, undefined);
});
test('roleRows 列出已退出的會計（exited），已退出的參與者仍略過', () => {
  const out = roleRows(
    [{ id: 1, nickname: 'S', user_id: 'u1', active: true }, { id: 2, nickname: 'Z', user_id: 'u2', active: false }, { id: 3, nickname: 'Y', user_id: 'u3', active: false }],
    [{ user_id: 'u1', role: 'accountant' }, { user_id: 'u2', role: 'accountant' }]);
  assert.deepEqual(out, [
    { member_id: 1, nickname: 'S', user_id: 'u1', role: 'accountant' },
    { member_id: 2, nickname: 'Z', user_id: 'u2', role: 'accountant', exited: true },
  ]);
});
test('roleErrorText', () => {
  assert.equal(roleErrorText({ message: 'P0001: 至少要保留一位會計' }), '至少要保留一位會計');
  assert.equal(roleErrorText({ message: 'boom' }), 'boom');
});
test('setRole upsert / delete，錯誤會丟出', async () => {
  const calls: unknown[] = [];
  const mk = (error: unknown) => ({
    from: (t: string) => ({
      upsert: (v: unknown) => { calls.push(['upsert', t, v]); return Promise.resolve({ error }); },
      delete: () => ({ eq: (c: string, v: string) => { calls.push(['delete', t, c, v]); return Promise.resolve({ error }); } }),
    }),
  });
  await setRole(mk(null), 'u4', 'accountant');
  await setRole(mk(null), 'u2', 'member');
  assert.deepEqual(calls, [['upsert', 'fund_roles', { user_id: 'u4', role: 'accountant' }], ['delete', 'fund_roles', 'user_id', 'u2']]);
  await assert.rejects(setRole(mk({ message: 'x' }), 'u4', 'member'));
});
