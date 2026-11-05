import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markPayablePaid } from './payable.ts';

const fake = (res: { data: unknown; error: { message: string } | null }) => {
  const calls: unknown[][] = [];
  const q: any = {
    update: (...a: unknown[]) => { calls.push(['update', ...a]); return q; },
    eq: (...a: unknown[]) => { calls.push(['eq', ...a]); return q; },
    select: (...a: unknown[]) => { calls.push(['select', ...a]); return Promise.resolve(res); },
  };
  return { client: { from: () => q } as any, calls };
};

test('markPayablePaid: success updates only open rows', async () => {
  const { client, calls } = fake({ data: [{ id: 3 }], error: null });
  assert.deepEqual(await markPayablePaid(client, 3, 99), { ok: true });
  assert.deepEqual(calls[0], ['update', { status: 'paid', paid_transaction_id: 99 }]);
  assert.deepEqual(calls[2], ['eq', 'status', 'open']);
});

test('markPayablePaid: 0 rows is failure', async () => {
  const { client } = fake({ data: [], error: null });
  const r = await markPayablePaid(client, 3, 99);
  assert.equal(r.ok, false);
});

test('markPayablePaid: error is failure with message', async () => {
  const { client } = fake({ data: null, error: { message: 'rls' } });
  assert.deepEqual(await markPayablePaid(client, 3, 99), { ok: false, reason: 'rls' });
});
