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
test('roleRows 合併成員與角色、略過停用成員', () => {
  const out = roleRows(
    [{ id: 1, nickname: 'S', user_id: 'u1', active: true }, { id: 2, nickname: 'Z', user_id: 'u2', active: false }, { id: 3, nickname: 'X', user_id: null, active: true }],
    [{ user_id: 'u1', role: 'accountant' }]);
  assert.deepEqual(out.map((r) => [r.nickname, r.role]), [['S', 'accountant'], ['X', 'member']]);
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
