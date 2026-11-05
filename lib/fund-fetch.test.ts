import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllTransactions } from './fund-fetch.ts';

const makeClient = (total: number) => {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1, fund_lines: [] }));
  let rangeCalls = 0;
  const q: any = {
    select: () => q,
    order: () => q,
    range: async (from: number, to: number) => { rangeCalls++; return { data: rows.slice(from, to + 1), error: null }; },
  };
  return { client: { from: () => q } as any, calls: () => rangeCalls };
};

test('fetchAllTransactions pages through 1,203 rows in 2 requests', async () => {
  const { client, calls } = makeClient(1203);
  const out = await fetchAllTransactions(client);
  assert.equal(out.length, 1203);
  assert.equal(calls(), 2);
  assert.equal((out[0] as any).id, 1);
  assert.equal((out[1202] as any).id, 1203);
});

test('fetchAllTransactions throws on error', async () => {
  const q: any = { select: () => q, order: () => q, range: async () => ({ data: null, error: new Error('boom') }) };
  await assert.rejects(() => fetchAllTransactions({ from: () => q } as any), /boom/);
});
