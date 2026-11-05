// 統計頁純函式。summaries 輸入為「新 → 舊」（getPeriodSummaries 的順序）。
import { INCOME_SOURCE_LABEL } from '../fund.ts';
import type { PeriodSummary } from './api.ts';

export const rangeOptions = ['近 6 期', '近 12 期', '全部'] as const;
export type RangeOption = (typeof rangeOptions)[number];
export const rangeCount = (r: RangeOption): number => (r === '近 6 期' ? 6 : r === '近 12 期' ? 12 : Infinity);

export const EXPENSE_GROUPS = ['貸款與信用卡', '交通與車輛', '水電與通訊', '中央蘭室配置', '其他'] as const;

const labelOf = (p: PeriodSummary) => (p.period_no > 1 ? `${p.month}#${p.period_no}` : p.month);
const oldestFirst = (xs: PeriodSummary[]) => [...xs].reverse();

export const seriesFromPeriods = (summaries: PeriodSummary[]) =>
  oldestFirst(summaries).map((p) => ({ label: labelOf(p), endTotal: p.end_total, endMain: p.end_main, minMain: p.min_main }));

export const expenseGroups = (summaries: PeriodSummary[]) => {
  const known = new Set<string>(EXPENSE_GROUPS);
  return EXPENSE_GROUPS.map((group) => ({
    group,
    amount: summaries.reduce((a, p) => {
      let v = p.expense_by_group[group] ?? 0;
      if (group === '其他') for (const [k, x] of Object.entries(p.expense_by_group)) if (!known.has(k)) v += x;
      return a + v;
    }, 0),
  }));
};

export const incomeShares = (summaries: PeriodSummary[]) => {
  const labels = INCOME_SOURCE_LABEL as Record<string, string>;
  const sums = new Map<string, number>();
  for (const p of summaries) for (const [k, v] of Object.entries(p.income_by_source)) sums.set(k, (sums.get(k) ?? 0) + v);
  const rows = [...sums].filter(([, v]) => v > 0);
  const total = rows.reduce((a, [, v]) => a + v, 0);
  return rows
    .map(([source, amount]) => ({ source, label: labels[source] ?? '其他', amount, pct: total ? Math.round((amount / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount);
};

export const salonByPeriod = (summaries: PeriodSummary[]) =>
  oldestFirst(summaries).map((p) => ({ label: labelOf(p), amount: p.salon_income }));
