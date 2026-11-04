import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRole } from './role.ts';

const makeClient = (uid: string | null, rows: { role: string }[] | null, error: unknown = null) => {
  const q: any = {
    select: () => q,
    eq: (col: string, val: string) => { assert.equal(col, 'user_id'); assert.equal(val, uid); return q; },
    maybeSingle: async () => ({ data: rows && rows[0] ? rows[0] : null, error }),
  };
  return {
    auth: { getUser: async () => ({ data: { user: uid ? { id: uid } : null }, error: null }) },
    from: (t: string) => { assert.equal(t, 'fund_roles'); return q; },
  } as any;
};

test('loadRole: accountant row -> accountant', async () => {
  assert.equal(await loadRole(makeClient('u1', [{ role: 'accountant' }])), 'accountant');
});
test('loadRole: no row -> member', async () => {
  assert.equal(await loadRole(makeClient('u1', [])), 'member');
});
test('loadRole: member row -> member', async () => {
  assert.equal(await loadRole(makeClient('u1', [{ role: 'member' }])), 'member');
});
test('loadRole: no user or query error -> member', async () => {
  assert.equal(await loadRole(makeClient(null, null)), 'member');
  assert.equal(await loadRole(makeClient('u1', null, new Error('x'))), 'member');
});
