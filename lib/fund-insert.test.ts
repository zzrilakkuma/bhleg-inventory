import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertTransactionWith } from './fund-insert.ts';

const fakeClient = () => {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          const res = { data: { id: 42 }, error: null };
          return { select: () => ({ single: async () => res }), then: (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f) };
        },
        delete() { calls.push({ table, op: 'delete' }); return { eq: async () => ({ error: null }) }; },
      };
    },
  };
  return { client, calls };
};
const tx = { type: 'settlement' as const, occurred_on: '2026-11-25', title: 't', amount: 0 };

test('insertTransactionWith: no fund_lines insert when lines empty (or all zero)', async () => {
  for (const lines of [[], [{ account_id: 1, storage_id: 1, amount: 0 }]]) {
    const { client, calls } = fakeClient();
    const r = await insertTransactionWith(client as never, tx, lines, { table: 'fund_settlements', row: { month: '2026-11' } });
    assert.equal(r.id, 42);
    assert.deepEqual(calls.map((c) => `${c.table}:${c.op}`), ['fund_transactions:insert', 'fund_settlements:insert']);
  }
});

test('insertTransactionWith: inserts non-zero lines with transaction_id', async () => {
  const { client, calls } = fakeClient();
  await insertTransactionWith(client as never, tx, [{ account_id: 1, storage_id: 2, amount: 5 }, { account_id: 1, storage_id: 2, amount: 0 }]);
  const l = calls.find((c) => c.table === 'fund_lines')!;
  assert.deepEqual(l.payload, [{ account_id: 1, storage_id: 2, amount: 5, transaction_id: 42 }]);
});
