// 型別化的 fund_settings：預設值、解析、驗證、與章程的差異、日期換算、寫入。純函式（saveSetting 只用傳入的 client）。

export interface FundSettings {
  donation_due_day: number; settlement_due_day: number; group_settle_due_day: number;
  exit_notice_days: number; monthly_cap: number; standard_amount: number;
  freeze_rate: number; freeze_base: 'main' | 'total';
}
export type SettingKey = keyof FundSettings;

export const DEFAULT_SETTINGS: FundSettings = {
  donation_due_day: 14, settlement_due_day: 20, group_settle_due_day: 14,
  exit_notice_days: 5, monthly_cap: 5000, standard_amount: 1500,
  freeze_rate: 0.3, freeze_base: 'main',
};
export const CHARTER_SETTINGS: FundSettings = { ...DEFAULT_SETTINGS, freeze_base: 'total' };

export const SETTING_META: Record<SettingKey, { label: string; unit: string; hint: string }> = {
  donation_due_day: { label: '奉納截止日', unit: '日', hint: '每月幾號前奉納；過了還沒奉納的成員會列入待辦。可填 1–31，沒有那一天的月份視為月底。' },
  settlement_due_day: { label: '結算日', unit: '日', hint: '章程規定的結算日；實際結算晚於這天會記錄延後天數。可填 1–31。' },
  group_settle_due_day: { label: '小組結算截止日', unit: '日', hint: '小組每月幾號前結算。可填 1–31。' },
  exit_notice_days: { label: '退出提前告知天數', unit: '天', hint: '成員退出前需提前告知的天數，0 表示不限。' },
  monthly_cap: { label: '單月奉納上限', unit: '元', hint: '單人單月奉納超過時提醒，不會擋下。' },
  standard_amount: { label: '標準奉納金額', unit: '元', hint: '記奉納時的快速金額。' },
  freeze_rate: { label: '凍存比例', unit: '', hint: '緊急應變與共存前瞻各凍存的比例，填小數，例如 30% 填 0.3（上限 0.5）。' },
  freeze_base: { label: '凍存基準', unit: '', hint: '凍存比例乘上哪一個金額：不凍結零用金，或總餘款（章程原文）。' },
};

export const dayInMonth = (month: string, day: number): number => {
  const [y, m] = month.split('-').map(Number);
  return Math.min(day, new Date(y, m, 0).getDate());
};

const INT = /^\d+$/;
const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;
type Result = { ok: true; value: number | 'main' | 'total' } | { ok: false; reason: string };

export const validateSetting = (key: SettingKey, input: string): Result => {
  const s = input.trim();
  switch (key) {
    case 'donation_due_day': case 'settlement_due_day': case 'group_settle_due_day': {
      const n = INT.test(s) ? Number(s) : NaN;
      return n >= 1 && n <= 31 ? { ok: true, value: n } : { ok: false, reason: '請填 1 到 31 的整數' };
    }
    case 'exit_notice_days':
      return INT.test(s) ? { ok: true, value: Number(s) } : { ok: false, reason: '請填 0 以上的整數' };
    case 'monthly_cap': case 'standard_amount': {
      const n = INT.test(s) ? Number(s) : NaN;
      return n > 0 ? { ok: true, value: n } : { ok: false, reason: '請填大於 0 的整數金額' };
    }
    case 'freeze_rate': {
      const n = DECIMAL.test(s) ? Number(s) : NaN;
      return n >= 0 && n <= 0.5 ? { ok: true, value: n } : { ok: false, reason: '請填 0 到 0.5 之間的小數，例如 30% 填 0.3' };
    }
    case 'freeze_base':
      return s === 'main' || s === 'total' ? { ok: true, value: s } : { ok: false, reason: '請選不凍結零用金或總餘款' };
  }
};

export const parseSettings = (raw: Record<string, unknown>): FundSettings => {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const v = raw[key];
    if (typeof v !== 'number' && typeof v !== 'string') continue;
    const r = validateSetting(key, String(v));
    if (r.ok) out[key] = r.value;
  }
  return out as unknown as FundSettings;
};

export const formatSetting = (key: SettingKey, v: FundSettings[SettingKey]): string => {
  if (key === 'freeze_base') return v === 'total' ? '總餘款' : '不凍結零用金';
  if (key === 'freeze_rate') return `${Math.round(Number(v) * 10000) / 100}%`;
  const { unit } = SETTING_META[key];
  return unit === '元' ? `${Number(v).toLocaleString('en-US')} 元` : `${v} ${unit}`;
};

export const charterDiffs = (s: FundSettings) =>
  (Object.keys(CHARTER_SETTINGS) as SettingKey[])
    .filter((key) => s[key] !== CHARTER_SETTINGS[key])
    .map((key) => ({
      key, label: SETTING_META[key].label,
      charter: formatSetting(key, CHARTER_SETTINGS[key]), current: formatSetting(key, s[key]),
    }));

export const saveSetting = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (t: string) => any }, key: SettingKey, value: number | string,
): Promise<void> => {
  const { error } = await client.from('fund_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
};
