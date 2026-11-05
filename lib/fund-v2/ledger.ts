// 帳（B1）純函式：分組、單列摘要、期別視窗。
import { CATEGORY_OF, type FundCategory } from '../fund.ts';
import type { LedgerRow, FundPeriod } from './api.ts';

export const dateOf = (r: LedgerRow) => r.stated_on ?? r.occurred_on;

export const groupByDate = (rows: LedgerRow[]): { date: string; rows: LedgerRow[] }[] => {
  const out: { date: string; rows: LedgerRow[] }[] = [];
  for (const r of rows) {
    const d = dateOf(r);
    const last = out[out.length - 1];
    if (last && last.date === d) last.rows.push(r);
    else out.push({ date: d, rows: [r] });
  }
  return out;
};

const IN = new Set(['donation', 'income', 'loan', 'refund']);
const OUT = new Set(['expense', 'expense_claim', 'repayment']);

/** amount 為 null 代表顯示「—」 */
export const rowSummary = (r: LedgerRow): { title: string; amount: number | null; kind: 'in' | 'out' | 'neutral' } => {
  const title = (r.title ?? '').split('\n')[0];
  if (IN.has(r.type)) return { title, amount: Math.abs(r.amount), kind: 'in' };
  if (OUT.has(r.type)) return { title, amount: Math.abs(r.amount), kind: 'out' };
  if (r.type === 'transfer') return { title, amount: Math.abs(r.moved), kind: 'neutral' };
  return { title, amount: null, kind: 'neutral' };
};

export const categoryOf = (r: LedgerRow): FundCategory => CATEGORY_OF[r.type];

/** periods 為新到舊。loadedMore = 「載入更早」按了幾次。 */
export const pageWindow = (
  periods: FundPeriod[], selectedIndex: number, loadedMore: number, latestOrd: number,
): { fromOrd: number; toOrd: number } => {
  if (periods.length === 0) return { fromOrd: 1, toOrd: latestOrd };
  const sel = periods[selectedIndex];
  const from = periods[Math.min(periods.length - 1, selectedIndex + loadedMore)];
  return { fromOrd: from.start_ord, toOrd: selectedIndex === 0 ? latestOrd : sel.end_ord };
};

export interface EditFields { title: string; date: string; note: string; comment: string }

/** 日期欄只有在使用者真的改過（相對於顯示日期）才寫入 occurred_on／stated_on。 */
export const buildEditPatch = (original: EditFields, edited: EditFields) => {
  const patch: {
    title: string; note: string | null; comment: string | null; occurred_on?: string; stated_on?: string;
  } = { title: edited.title, note: edited.note || null, comment: edited.comment || null };
  if (edited.date !== original.date) { patch.occurred_on = edited.date; patch.stated_on = edited.date; }
  return patch;
};

/** 補記早於上次結算日的帳：只提醒，不擋送出 */
export const backdateWarning = (date: string, lastSettledOn: string | null): string | null =>
  lastSettledOn && date < lastSettledOn
    ? `這個日期早於上次結算（${lastSettledOn.replace(/-0?/g, '/')}），已公布的數字會跟著變動`
    : null;

/** 資料庫守門訊息直接顯示；其餘加前綴 */
export const deleteErrorText = (e: unknown): string => {
  const message = String((e as { message?: unknown } | null)?.message ?? e);
  return message.includes('請先刪除還款') || message.includes('請先刪除請款交易') ? message : `刪除失敗：${message}`;
};
