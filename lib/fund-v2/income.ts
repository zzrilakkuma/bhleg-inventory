// 記 — 收入：純函式（寫入組裝、專款分配、單月上限提醒）。
import { buildDonationTexts, buildOtherIncomeTexts, buildLoanTexts, INCOME_SOURCE_LABEL, monthLabel } from '../fund.ts';
import type { FundMember, FundHandler, FundStorage, IncomeSource } from '../fund.ts';
import type { NewTransaction, NewLine } from '../fund-db.ts';
import type { Refs } from './api.ts';

export interface Allocation { accountId: number; amount: number }

export interface IncomeWrite {
  tx: NewTransaction;
  lines: NewLine[];
  sub?: { table: 'fund_donations' | 'fund_loans'; row: Record<string, unknown> };
}

/** 各專款 allocation 到其科目，餘額到 main；存放一律 = storage。超額分配 → throw。 */
export const allocationLines = (
  amount: number, allocations: Allocation[], storage: FundStorage, refs: Pick<Refs, 'accounts'>,
): { lines: NewLine[]; remainder: number } => {
  const mainAcc = refs.accounts.find((a) => a.kind === 'main');
  if (!mainAcc) throw new Error('找不到主科目');
  const alloc = allocations.filter((a) => a.amount > 0);
  const remainder = amount - alloc.reduce((s, a) => s + a.amount, 0);
  if (remainder < 0) throw new Error('指定專款超過收入金額');
  const lines: NewLine[] = alloc.map((a) => ({ account_id: a.accountId, storage_id: storage.id, amount: a.amount }));
  if (remainder > 0) lines.push({ account_id: mainAcc.id, storage_id: storage.id, amount: remainder });
  return { lines, remainder };
};

export const buildIncomeWrite = (i: {
  source: IncomeSource; amount: number; date: string; member?: FundMember; payer?: FundMember;
  method: 'transfer' | 'cash'; last5?: string; handler?: FundHandler; storage: FundStorage;
  allocations: Allocation[]; months: string[]; message?: string; description?: string; refs: Refs; seq?: number;
}): IncomeWrite => {
  const { lines } = allocationLines(i.amount, i.allocations, i.storage, i.refs);
  const common = { occurred_on: i.date, amount: i.amount, seq: i.seq, income_source: i.source };
  const desc = (i.description ?? '').trim();
  const comment = i.message?.trim() || null;

  if (i.source === 'donation' && i.member) {
    const t = buildDonationTexts({
      member: i.member, payer: i.payer ?? null, months: i.months, paymentMethod: i.method,
      last5: i.last5, handlerName: i.handler?.name ?? null,
    });
    return {
      tx: { ...common, type: 'donation', title: t.title, voucher: t.voucher, note: t.note },
      lines,
      sub: {
        table: 'fund_donations',
        row: {
          member_id: i.member.id, payer_member_id: i.payer?.id ?? null, payment_method: i.method,
          last5: i.method === 'transfer' ? (i.last5 || null) : null,
          handler_id: i.method === 'cash' ? (i.handler?.id ?? null) : null,
          months: i.months, message: i.message?.trim() || null,
        },
      },
    };
  }

  if (i.source === 'loan') {
    const lender = i.member ? i.member.nickname : desc;
    if (!lender) throw new Error('缺少出借人');
    const t = buildLoanTexts({ lender, storageName: i.storage.name });
    return {
      tx: { ...common, comment, type: 'loan', title: t.title, voucher: t.voucher, note: t.note },
      lines,
      sub: {
        table: 'fund_loans',
        row: {
          lender_name: lender, lender_member_id: i.member?.id ?? null, principal: i.amount,
          started_on: i.date, status: 'open',
        },
      },
    };
  }

  const refund = i.source === 'reinject' || i.source === 'refund';
  const label = i.source === 'donation' ? '奉納' : INCOME_SOURCE_LABEL[i.source];
  const t = buildOtherIncomeTexts({
    source: label, description: desc, storageName: i.storage.name, accountName: i.refs.accounts.find((a) => a.kind === 'main')?.name ?? '', refund,
  });
  return {
    tx: { ...common, comment, type: refund ? 'refund' : 'income', title: t.title, voucher: t.voucher, note: t.note },
    lines,
  };
};

/** 逐月檢查：該成員該月既有（donation.months 含該月）+ 本筆平均分攤 > cap → 提醒第一個超過的月；否則 null。只提醒，不擋。 */
export const monthlyCapWarning = (
  member: { id: number }, months: string[],
  existing: { member_id: number; months: string[]; amount: number }[], amount: number, cap: number,
): string | null => {
  if (!months.length) return null;
  const share = amount / months.length;
  for (const m of [...months].sort()) {
    const sum = existing.filter((d) => d.member_id === member.id && d.months.length > 0 && d.months.includes(m))
      .reduce((s, d) => s + d.amount / d.months.length, 0) + share;
    if (sum > cap) return `${monthLabel(m)}累計 ${Math.round(sum)}，超過章程單月上限 ${cap}（僅提醒）`;
  }
  return null;
};
