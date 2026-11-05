import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openEmergency, validateDeclare, validateEnd, bannerText, emergencyDecisionRef, type Emergency } from './emergency.ts';

const E = (o: Partial<Emergency>): Emergency => ({ id: 1, started_on: '2026-11-05', ended_on: null, note: '停電', ...o });
test('openEmergency', () => {
  assert.equal(openEmergency([E({ ended_on: '2026-11-10' })]), null);
  assert.equal(openEmergency([E({ id: 2 }), E({ id: 1, ended_on: '2026-01-01' })])!.id, 2);
});
test('validateDeclare', () => {
  assert.deepEqual(validateDeclare([E({})], '2026-12-01', 'x'), { ok: false, reason: '已有進行中的緊急狀態，請先結束' });
  assert.deepEqual(validateDeclare([], '2026-12-01', '  '), { ok: false, reason: '請填寫動機與措施' });
  assert.deepEqual(validateDeclare([], '', 'x'), { ok: false, reason: '請選擇開始日' });
  assert.equal(validateDeclare([E({ ended_on: '2026-11-10' })], '2026-12-01', 'x').ok, true);
});
test('validateEnd', () => {
  assert.deepEqual(validateEnd(E({}), '2026-11-04'), { ok: false, reason: '結束日不能早於開始日' });
  assert.equal(validateEnd(E({}), '2026-11-05').ok, true);
});
test('bannerText / emergencyDecisionRef', () => {
  assert.equal(bannerText(E({})), '緊急狀態中（自 2026/11/5 起）：停電');
  assert.equal(emergencyDecisionRef(E({})), '緊急狀態 2026/11/5');
  assert.equal(bannerText(E({ note: null, started_on: 'bad' })), '緊急狀態中（自 bad 起）：');
});
