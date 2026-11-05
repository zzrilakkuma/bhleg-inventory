import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, CHARTER_SETTINGS, parseSettings, validateSetting, charterDiffs, dayInMonth, saveSetting,
} from './settings.ts';

test('parseSettings 以預設補缺、忽略不合法值', () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  const s = parseSettings({ freeze_rate: 'abc', monthly_cap: 8000, freeze_base: 'weird', settlement_due_day: '25' });
  assert.equal(s.freeze_rate, 0.3); assert.equal(s.monthly_cap, 8000);
  assert.equal(s.freeze_base, 'main'); assert.equal(s.settlement_due_day, 25);
});
test('validateSetting 日期 1–31', () => {
  assert.deepEqual(validateSetting('settlement_due_day', '20'), { ok: true, value: 20 });
  assert.deepEqual(validateSetting('donation_due_day', '31'), { ok: true, value: 31 });
  for (const bad of ['0', '32', '', '1.5', '-3', 'x']) assert.equal(validateSetting('donation_due_day', bad).ok, false);
});
test('dayInMonth：該月沒有那一天就取月底', () => {
  assert.equal(dayInMonth('2026-02', 31), 28);
  assert.equal(dayInMonth('2028-02', 30), 29);
  assert.equal(dayInMonth('2026-11', 31), 30);
  assert.equal(dayInMonth('2026-11', 14), 14);
});
test('validateSetting 凍存比例 0–0.5，擋住把 30 當 30%', () => {
  assert.deepEqual(validateSetting('freeze_rate', '0.3'), { ok: true, value: 0.3 });
  assert.deepEqual(validateSetting('freeze_rate', '0'), { ok: true, value: 0 });
  const r = validateSetting('freeze_rate', '30');
  assert.equal(r.ok, false); assert.match((r as { reason: string }).reason, /0\.3/);
  assert.equal(validateSetting('freeze_rate', '0.51').ok, false);
});
test('validateSetting 金額為正整數、天數為 0 以上整數、基準二選一', () => {
  assert.equal(validateSetting('monthly_cap', '0').ok, false);
  assert.equal(validateSetting('standard_amount', '1500.5').ok, false);
  assert.deepEqual(validateSetting('exit_notice_days', '0'), { ok: true, value: 0 });
  assert.deepEqual(validateSetting('freeze_base', 'total'), { ok: true, value: 'total' });
  assert.equal(validateSetting('freeze_base', 'x').ok, false);
});
test('charterDiffs：預設實務只有凍存基準與章程不同', () => {
  const d = charterDiffs(DEFAULT_SETTINGS);
  assert.deepEqual(d.map((x) => x.key), ['freeze_base']);
  assert.equal(charterDiffs(CHARTER_SETTINGS).length, 0);
  assert.deepEqual(charterDiffs({ ...DEFAULT_SETTINGS, settlement_due_day: 5 }).map((x) => x.key), ['settlement_due_day', 'freeze_base']);
});
test('saveSetting upsert key/value/updated_at', async () => {
  let got: { table: string; row: Record<string, unknown>; opts: unknown } | null = null;
  const client = { from: (table: string) => ({ upsert: async (row: Record<string, unknown>, opts: unknown) => { got = { table, row, opts }; return { error: null }; } }) };
  await saveSetting(client, 'freeze_rate', 0.4);
  assert.equal(got!.table, 'fund_settings');
  assert.equal(got!.row.key, 'freeze_rate'); assert.equal(got!.row.value, 0.4);
  assert.equal(typeof got!.row.updated_at, 'string');
  const bad = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
  await assert.rejects(() => saveSetting(bad, 'freeze_rate', 0.4), /boom/);
});
