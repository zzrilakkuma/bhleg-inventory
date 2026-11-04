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
  if (r.type === 'transfer') return { title, amount: Math.abs(r.amount), kind: 'neutral' };
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
