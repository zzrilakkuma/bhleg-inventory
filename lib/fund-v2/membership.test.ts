import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inMonth, membersInMonth, validateMembership, buildExitPatch, buildRejoinPatch, exitNoticeWarning, donationGrid } from './membership.ts';
import type { FundMember } from '../fund.ts';

const M = (o: Partial<FundMember>) => ({ active: true, joined_at: null, left_at: null, ...o });

test('inMonth：沒有日期的舊成員看 active', () => {
  assert.equal(inMonth(M({}), '2026-11'), true);
  assert.equal(inMonth(M({ active: false }), '2026-11'), false);
});
test('inMonth：加入當月起算、退出當月仍算', () => {
  const m = M({ joined_at: '2026-03-18', left_at: '2026-08-02', active: false });
  assert.equal(inMonth(m, '2026-02'), false);
  assert.equal(inMonth(m, '2026-03'), true);
  assert.equal(inMonth(m, '2026-08'), true);
  assert.equal(inMonth(m, '2026-09'), false);
});
test('inMonth：只有加入日、尚未加入的月份不算；已加入但 active=false 且無退出日不算', () => {
  assert.equal(inMonth(M({ joined_at: '2026-12-01' }), '2026-11'), false);
  assert.equal(inMonth(M({ joined_at: '2026-11-30' }), '2026-11'), true);
  assert.equal(inMonth(M({ joined_at: '2026-01-01', active: false }), '2026-11'), false);
});
test('membersInMonth 過濾', () => {
  const ms = [{ id: 1, ...M({}) }, { id: 2, ...M({ active: false }) }];
  assert.deepEqual(membersInMonth(ms, '2026-11').map((x) => x.id), [1]);
});
test('validateMembership', () => {
  assert.equal(validateMembership('2026-03-01', '').ok, true);
  assert.equal(validateMembership('2026-03-01', '2026-02-28').ok, false);
  assert.equal(validateMembership('', '2026-02-28').ok, true);
  assert.equal(validateMembership('2026-03-01', '2026-03-01').ok, true);
});
test('buildExitPatch / buildRejoinPatch', () => {
  assert.deepEqual(buildExitPatch('2026-11-20', '  搬家 '), { left_at: '2026-11-20', exit_note: '搬家', active: false });
  assert.deepEqual(buildExitPatch('2026-11-20', '  '), { left_at: '2026-11-20', exit_note: null, active: false });
  assert.deepEqual(buildRejoinPatch('2026-12-01'), { joined_at: '2026-12-01', left_at: null, exit_note: null, active: true });
});
test('exitNoticeWarning：少於告知天數才提醒', () => {
  assert.equal(exitNoticeWarning('2026-11-20', '2026-11-05', 5), null);
  assert.equal(exitNoticeWarning('2026-11-10', '2026-11-05', 5), null);
  assert.match(exitNoticeWarning('2026-11-08', '2026-11-05', 5)!, /5 天/);
  assert.match(exitNoticeWarning('2026-11-08', '2026-11-05', 5)!, /3 天/);
  assert.match(exitNoticeWarning('2026-11-05', '2026-11-05', 5)!, /這次沒有提前告知/);
  assert.match(exitNoticeWarning('2026-11-01', '2026-11-05', 5)!, /這次沒有提前告知/);
});

test('donationGrid：整筆記在收款月、在籍外為 na、截止日前不算未繳', () => {
  const ms = [
    { id: 1, nickname: 'A', sort_order: 1, active: true, joined_at: null, left_at: null },
    { id: 2, nickname: 'B', sort_order: 2, active: true, joined_at: '2026-11-01', left_at: null },
  ] as FundMember[];
  const rows = [{ member_id: 1, months: ['2026-10', '2026-11'], amount: 3000, paid_on: '2026-11-03' }];
  const g = donationGrid(ms, ['2026-10', '2026-11'], rows, '2026-11-05', 14);
  assert.deepEqual(g[0].cells, [{ state: 'covered' }, { state: 'paid', amount: 3000 }]);
  assert.deepEqual(g[1].cells, [{ state: 'na' }, { state: 'na' }]);
  const late = donationGrid(ms, ['2026-11'], rows.slice(0, 0), '2026-11-20', 14);
  assert.deepEqual(late.map((r) => r.cells[0].state), ['unpaid', 'unpaid']);
});
test('donationGrid：收款月不在涵蓋月份內 → 記在第一個涵蓋月；同格多筆相加', () => {
  const ms = [{ id: 1, nickname: 'A', sort_order: 1, active: true, joined_at: null, left_at: null }] as FundMember[];
  const rows = [
    { member_id: 1, months: ['2025-12', '2026-01', '2026-02'], amount: 4500, paid_on: '2026-03-02' },
    { member_id: 1, months: ['2025-12'], amount: 500, paid_on: '2025-12-20' },
  ];
  const g = donationGrid(ms, ['2025-12', '2026-01', '2026-02', '2026-03'], rows, '2026-03-20', 14);
  assert.deepEqual(g[0].cells, [{ state: 'paid', amount: 5000 }, { state: 'covered' }, { state: 'covered' }, { state: 'unpaid' }]);
});
test('donationGrid：截止日 31 在短月視為月底；空 months 只涵蓋收款月；未來月份無奉納為 na；只列在籍者', () => {
  const ms = [
    { id: 1, nickname: 'A', sort_order: 1, active: true, joined_at: null, left_at: null },
    { id: 2, nickname: 'Gone', sort_order: 2, active: false, joined_at: null, left_at: '2025-01-10' },
  ] as FundMember[];
  const feb = donationGrid(ms, ['2026-02'], [], '2026-02-28', 31);
  assert.equal(feb.length, 1);
  assert.deepEqual(feb[0].cells, [{ state: 'na' }]);
  const feb2 = donationGrid(ms, ['2026-02', '2026-03'], [], '2026-03-01', 31);
  assert.deepEqual(feb2[0].cells, [{ state: 'unpaid' }, { state: 'na' }]);
  const legacy = [{ member_id: 1, months: [], amount: 1500, paid_on: '2026-02-05' }];
  assert.deepEqual(donationGrid(ms, ['2026-01', '2026-02'], legacy, '2026-02-20', 14)[0].cells,
    [{ state: 'unpaid' }, { state: 'paid', amount: 1500 }]);
});
