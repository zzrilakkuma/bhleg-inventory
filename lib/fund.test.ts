import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRunningBalances } from './fund.ts';
test('computeRunningBalances orders by occurred_on, seq, id', () => {
  const txs = [
    { id: 2, occurred_on: '2024-11-06', seq: 0, fund_lines: [{ account_id: 1, storage_id: 1, amount: 1500 }] },
    { id: 1, occurred_on: '2024-11-05', seq: 0, fund_lines: [{ account_id: 1, storage_id: 1, amount: 46 }] },
  ] as never[];
  const { ordered, snapshots } = computeRunningBalances(txs);
  assert.deepEqual(ordered.map((t) => t.id), [1, 2]);
  assert.equal(snapshots.get(2)!.total, 1546);
});
