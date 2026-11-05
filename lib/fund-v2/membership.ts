// 成員在籍：純函式。month = 'YYYY-MM'，日期 = 'YYYY-MM-DD'。
import type { FundMember } from '../fund.ts';

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
