// 算首頁「要做的事」：純函式。
import { monthLabel, type FundMember } from '../fund.ts';
import { dayInMonth } from './settings.ts';
import { membersInMonth } from './membership.ts';

export interface PayableLike { id: number; title: string; amount: number; due_on: string | null }
export interface DuePayable<P extends PayableLike = PayableLike> { payable: P; overdue: boolean }
export type TodoItem<P extends PayableLike = PayableLike> =
  | { kind: 'payable'; payable: P; overdue: boolean }
  | { kind: 'unclaimed'; count: number; sum: number }
  | { kind: 'unpaid'; count: number };

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const unpaidMembers = (
  members: FundMember[], donationsThisMonth: { member_id: number | null; months: string[] }[],
  today: Date, dueDay: number,
): FundMember[] => {
  const month = ymd(today).slice(0, 7);
  if (today.getDate() <= dayInMonth(month, dueDay)) return [];
  const paid = new Set(donationsThisMonth.filter((d) => d.months.includes(month)).map((d) => d.member_id));
  return membersInMonth(members, month).filter((x) => !paid.has(x.id));
};

export const duePayables = <P extends PayableLike>(payables: P[], today: Date): DuePayable<P>[] => {
  const t = ymd(today);
  return payables
    .map((payable) => ({ payable, overdue: payable.due_on != null && payable.due_on < t }))
    .sort((a, b) => {
      const x = a.payable.due_on, y = b.payable.due_on;
      if (x === y) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return x.localeCompare(y);
    });
};

export const todoItems = <P extends PayableLike>(i: {
  payables: DuePayable<P>[]; unclaimed: { amount: number }[]; unpaid: FundMember[];
}): TodoItem<P>[] => {
  const out: TodoItem<P>[] = i.payables.map((p) => ({ kind: 'payable', payable: p.payable, overdue: p.overdue }));
  if (i.unclaimed.length) out.push({ kind: 'unclaimed', count: i.unclaimed.length, sum: i.unclaimed.reduce((s, e) => s + e.amount, 0) });
  if (i.unpaid.length) out.push({ kind: 'unpaid', count: i.unpaid.length });
  return out;
};

export const unpaidListText = (members: FundMember[], month: string): string =>
  `${monthLabel(month)} 尚未奉納：${members.map((x) => x.nickname).join('、')}`;
