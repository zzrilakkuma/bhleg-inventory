// 成員在籍：純函式。month = 'YYYY-MM'，日期 = 'YYYY-MM-DD'。
import type { FundMember } from '../fund.ts';
import { dayInMonth } from './settings.ts';

type Tenure = Pick<FundMember, 'active' | 'joined_at' | 'left_at'>;

/** left_at 有值時只看日期區間；left_at 為空時還要 active。 */
export const inMonth = (m: Tenure, month: string): boolean => {
  if (m.joined_at && m.joined_at.slice(0, 7) > month) return false;
  if (m.left_at) return m.left_at.slice(0, 7) >= month;
  return m.active;
};

export const membersInMonth = <M extends Tenure>(members: M[], month: string): M[] =>
  members.filter((m) => inMonth(m, month));

export const validateMembership = (joined: string, left: string): { ok: true } | { ok: false; reason: string } =>
  joined && left && left < joined ? { ok: false, reason: '退出日不能早於加入日' } : { ok: true };

export const buildExitPatch = (leftOn: string, note: string) =>
  ({ left_at: leftOn, exit_note: note.trim() || null, active: false as const });

export const buildRejoinPatch = (joinedOn: string) =>
  ({ joined_at: joinedOn, left_at: null, exit_note: null, active: true as const });

const dayNumber = (iso: string) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, mo - 1, d) / 86400000);
};

export const exitNoticeWarning = (leftOn: string, today: string, noticeDays: number): string | null => {
  const n = dayNumber(leftOn) - dayNumber(today);
  if (n >= noticeDays) return null;
  return n <= 0
    ? `章程要求退出前 ${noticeDays} 天告知，這次沒有提前告知`
    : `章程要求退出前 ${noticeDays} 天告知，這次只提前 ${n} 天`;
};

export interface DonationRow { member_id: number | null; months: string[]; amount: number; paid_on: string }
export type Cell = { state: 'paid'; amount: number } | { state: 'covered' } | { state: 'unpaid' } | { state: 'na' };

/**
 * 每月奉納一覽。一筆奉納的整筆金額只記在一格（不平均分攤）：收款月在涵蓋月份內就記收款月，
 * 否則記涵蓋月份的第一個；其餘涵蓋月份為 covered。months 為空的舊資料只涵蓋收款月。
 * 在籍、無奉納：早於本月，或本月且今天 > 截止日 → unpaid；其餘 na。
 */
export const donationGrid = (
  members: FundMember[], months: string[], rows: DonationRow[], today: string, dueDay: number,
): { member: FundMember; cells: Cell[] }[] => {
  const paid = new Map<string, number>();
  const covered = new Set<string>();
  for (const r of rows) {
    if (r.member_id == null) continue;
    const payMonth = r.paid_on.slice(0, 7);
    const cover = r.months.length ? r.months : [payMonth];
    const booked = cover.includes(payMonth) ? payMonth : cover[0];
    const k = `${r.member_id}|${booked}`;
    paid.set(k, (paid.get(k) ?? 0) + r.amount);
    for (const m of cover) if (m !== booked) covered.add(`${r.member_id}|${m}`);
  }
  const thisMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  return members
    .filter((m) => months.some((mo) => inMonth(m, mo)))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((member) => ({
      member,
      cells: months.map((mo): Cell => {
        const k = `${member.id}|${mo}`;
        const amt = paid.get(k);
        if (amt !== undefined) return { state: 'paid', amount: amt };
        if (covered.has(k)) return { state: 'covered' };
        if (!inMonth(member, mo)) return { state: 'na' };
        const overdue = mo < thisMonth || (mo === thisMonth && todayDay > dayInMonth(mo, dueDay));
        return overdue ? { state: 'unpaid' } : { state: 'na' };
      }),
    }));
};
