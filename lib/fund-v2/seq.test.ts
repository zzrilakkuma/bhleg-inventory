import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSeq } from './seq.ts';

test('nextSeq: same-day max + 1', () => {
  assert.equal(nextSeq([{ occurred_on: '2026-11-05', seq: 1 }, { occurred_on: '2026-11-05', seq: 2 }], '2026-11-05'), 3);
});
test('nextSeq: no same-day rows -> 1', () => {
  assert.equal(nextSeq([{ occurred_on: '2026-11-04', seq: 7 }], '2026-11-05'), 1);
  assert.equal(nextSeq([], '2026-11-05'), 1);
});
test('nextSeq: other days do not affect; gaps use max', () => {
  assert.equal(nextSeq([
    { occurred_on: '2026-11-05', seq: 5 }, { occurred_on: '2026-11-05', seq: 2 }, { occurred_on: '2026-11-06', seq: 9 },
  ], '2026-11-05'), 6);
});
