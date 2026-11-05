import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDate, missingPayables, ensureMonthlyPayables } from './autopay.ts';
import type { FundTemplate } from '../fund.ts';

const T = (o: Partial<FundTemplate>) => ({ id: 1, name: '華南貸款', vendor: '華南 貸款', default_amount: 17434, recurring: true, active: true, due_day: null, ...o }) as FundTemplate;

test('dueDate', () => {
  assert.equal(dueDate('2026-11', null), null);
  assert.equal(dueDate('2026-11', 5), '2026-11-05');
  assert.equal(dueDate('2026-02', 31), '2026-02-28');
});

test('missingPayables：只產生有預設金額、尚未建立、本月未支出的模板', () => {
  const ts = [T({}), T({ id: 2, name: '電費', vendor: '台灣電力公司', default_amount: null }), T({ id: 3, name: '國泰貸款', vendor: '國泰 貸款', default_amount: 5453 }),
              T({ id: 4, name: '停車場月租', vendor: 'USPACE', default_amount: 3800 }), T({ id: 5, name: '舊', default_amount: 100, active: false })];
  const out = missingPayables(ts, '2026-11', [{ template_id: 3, for_month: '2026-11' }, { template_id: 1, for_month: '2026-10' }], new Set(['USPACE']));
  assert.deepEqual(out, [{ title: '11月 華南貸款', amount: 17434, due_on: null, template_id: 1, vendor: '華南 貸款', for_month: '2026-11', status: 'open' }]);
});

test('missingPayables：手動帶入、未標月份的 open 應付算已存在；已付/取消的不算', () => {
  const ts = [T({}), T({ id: 2, name: '電費' }), T({ id: 3, name: '水費' })];
  const out = missingPayables(ts, '2026-11', [
    { template_id: 1, for_month: null, status: 'open' },
    { template_id: 2, for_month: null, status: 'paid' },
    { template_id: 3, for_month: null, status: 'cancelled' },
  ], new Set());
  assert.deepEqual(out.map((p) => p.template_id), [2, 3]);
});

test('missingPayables：非固定模板與 due_day 帶入', () => {
  const out = missingPayables([T({ recurring: false }), T({ id: 2, due_day: 5 })], '2026-11', [], new Set());
  assert.equal(out.length, 1);
  assert.equal(out[0].due_on, '2026-11-05');
});

test('ensureMonthlyPayables：空清單不打 API；有清單用 ignoreDuplicates', async () => {
  const calls: any[] = [];
  const client = { from: (t: string) => ({ upsert: (rows: any, opt: any) => { calls.push([t, rows.length, opt]); return Promise.resolve({ error: null }); } }) };
  assert.equal(await ensureMonthlyPayables(client, []), 0);
  assert.equal(calls.length, 0);
  assert.equal(await ensureMonthlyPayables(client, missingPayables([T({})], '2026-11', [], new Set())), 1);
  assert.deepEqual(calls[0], ['fund_payables', 1, { onConflict: 'template_id,for_month', ignoreDuplicates: true }]);
});

test('ensureMonthlyPayables：API 錯誤會丟出', async () => {
  const client = { from: () => ({ upsert: () => Promise.resolve({ error: new Error('x') }) }) };
  await assert.rejects(ensureMonthlyPayables(client, missingPayables([T({})], '2026-11', [], new Set())));
});
