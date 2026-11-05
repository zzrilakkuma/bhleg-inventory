import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inMonth, membersInMonth, validateMembership, buildExitPatch, buildRejoinPatch, exitNoticeWarning } from './membership.ts';
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
