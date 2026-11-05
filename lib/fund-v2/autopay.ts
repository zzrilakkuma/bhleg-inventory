// 算：每月固定應付自動產生。純函式 + 一個寫入函式（client 由呼叫端傳入）。
import type { FundTemplate } from '../fund.ts';
import { dayInMonth } from './settings.ts';

export interface NewPayable {
  title: string; amount: number; due_on: string | null; template_id: number;
  vendor: string | null; for_month: string; status: 'open';
}

/** due_day 為空 → null；其餘超過該月天數取月底 */
export const dueDate = (month: string, dueDay: number | null): string | null =>
  dueDay == null ? null : `${month}-${String(dayInMonth(month, dueDay)).padStart(2, '0')}`;

export const missingPayables = (
  templates: FundTemplate[], month: string,
  existing: { template_id: number | null; for_month: string | null }[],
  expensedVendors: Set<string>,
): NewPayable[] => {
  const have = new Set(existing.filter((e) => e.for_month === month).map((e) => e.template_id));
  const m = Number(month.slice(5, 7));
  const out: NewPayable[] = [];
  for (const t of templates) {
    if (!t.active || !t.recurring || !(t.default_amount != null && t.default_amount > 0)) continue;
    if (have.has(t.id)) continue;
    if (t.vendor && expensedVendors.has(t.vendor)) continue;
    out.push({ title: `${m}月 ${t.name}`, amount: t.default_amount, due_on: dueDate(month, t.due_day),
      template_id: t.id, vendor: t.vendor, for_month: month, status: 'open' });
  }
  return out;
};

/** 回傳送出的列數；已存在的 (template_id, for_month) 由資料庫忽略 */
export const ensureMonthlyPayables = async (
  client: { from: (t: string) => any }, rows: NewPayable[],
): Promise<number> => {
  if (!rows.length) return 0;
  const { error } = await client.from('fund_payables')
    .upsert(rows, { onConflict: 'template_id,for_month', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
};
