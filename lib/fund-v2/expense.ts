// 記 — 支出：純函式（模板、標籤猜測、寫入組裝、影響計算、小組彙整）。
import { buildExpenseTexts } from '../fund.ts';
import type { FundTemplate, FundExpense, FundStorage, FundAdvancer, ClaimStatus } from '../fund.ts';
import type { NewTransaction, NewLine } from '../fund-db.ts';
import type { Refs } from './api.ts';

/** month = 'YYYY-MM'。recurring 且本月尚無同 vendor 支出的啟用模板 */
export const pendingRecurring = (
  templates: FundTemplate[], expensesThisMonth: { vendor: string | null; occurred_on: string }[], month: string,
): FundTemplate[] => {
  const done = new Set(expensesThisMonth.filter((e) => e.occurred_on.startsWith(month)).map((e) => e.vendor));
  return templates.filter((t) => t.active && t.recurring && !(t.vendor && done.has(t.vendor)));
};

export const guessTags = (_vendor: string, last?: FundExpense, template?: FundTemplate): string[] => {
  if (template && template.tags.length) return [...template.tags];
  if (last && last.tags.length) return [...last.tags];
  return [];
};

export interface ExpenseWrite {
  tx: NewTransaction & { off_ledger: boolean };
  lines: NewLine[];
  sub: {
    table: 'fund_expenses';
    row: {
      vendor: string; description: string; voucher_no: string; tags: string[];
      advancer_id: number | null; claim_status: ClaimStatus;
    };
  };
}

export const buildExpenseWrite = (i: {
  amount: number; vendor: string; description: string; date: string; storage?: FundStorage;
  advancer?: FundAdvancer; accountId: number; tags: string[]; voucher?: string; note?: string; refs: Refs; seq?: number;
}): ExpenseWrite => {
  const account = i.refs.accounts.find((a) => a.id === i.accountId);
  const texts = buildExpenseTexts({
    vendor: i.vendor, description: i.description, voucherNo: i.voucher ?? '', tags: i.tags,
    storageName: i.storage?.name ?? '', accountName: account?.name ?? '', advancerName: i.advancer?.name ?? null,
  });
  const offLedger = !!i.advancer;
  if (!offLedger && !i.storage) throw new Error('缺少存放');
  return {
    tx: {
      type: 'expense', occurred_on: i.date, title: texts.title, voucher: texts.voucher,
      note: [texts.note, i.note?.trim()].filter(Boolean).join('\n'),
      amount: -i.amount, seq: i.seq, off_ledger: offLedger,
    },
    lines: offLedger ? [] : [{ account_id: i.accountId, storage_id: i.storage!.id, amount: -i.amount }],
    sub: {
      table: 'fund_expenses',
      row: {
        vendor: i.vendor, description: i.description, voucher_no: i.voucher ?? '', tags: i.tags,
        advancer_id: i.advancer?.id ?? null, claim_status: offLedger ? 'unclaimed' : 'none',
      },
    },
  };
};

/** 對不凍結零用金的影響。帳外 → 0；非主科目 → 0（mainAccountId 有給時判斷） */
export const expenseImpact = (w: ExpenseWrite, mainAccountId?: number): number => {
  if (w.tx.off_ledger) return 0;
  return w.lines
    .filter((l) => mainAccountId == null || l.account_id === mainAccountId)
    .reduce((s, l) => s + l.amount, 0);
};

export const buildGroupSummaryWrite = (i: {
  groupAccountId: number; month: string; items: { desc: string; amount: number }[]; refs: Refs;
  date?: string; seq?: number;
}): { tx: NewTransaction; lines: NewLine[] } => {
  const acc = i.refs.accounts.find((a) => a.id === i.groupAccountId);
  if (!acc) throw new Error('找不到小組科目');
  if (acc.default_storage_id == null) throw new Error('該科目沒有預設存放');
  const items = i.items.filter((it) => it.amount > 0);
  if (!items.length) throw new Error('至少一個項目');
  const monthNo = Number(i.month.split('-')[1]);
  const total = items.reduce((s, it) => s + it.amount, 0);
  return {
    tx: {
      type: 'group_summary', occurred_on: i.date ?? `${i.month}-28`, title: `${acc.name} ${monthNo}月 彙整`,
      voucher: '#', note: items.map((it) => `${it.desc} ${it.amount}`).join('\n'),
      amount: -total, seq: i.seq, group_id: acc.id,
    },
    lines: items.map((it) => ({
      account_id: acc.id, storage_id: acc.default_storage_id!, amount: -it.amount, label: it.desc,
    })),
  };
};

/** 放棄請款：只改 claim_status，不建交易、不動 lines。僅限目前為 unclaimed 的列。 */
export const waiveClaims = async (
  client: { from: (t: string) => any }, transactionIds: number[],
): Promise<void> => {
  if (!transactionIds.length) return;
  const { error } = await client.from('fund_expenses').update({ claim_status: 'waived' })
    .in('transaction_id', transactionIds).eq('claim_status', 'unclaimed');
  if (error) throw error;
};

/** 「錢從哪裡出」可選存放：永不含「待清償」；主科目只有 郵局／現金；小組／專款再加各現金袋與其預設存放。 */
export const selectableStorages = (
  storages: FundStorage[], account?: { kind: string; default_storage_id: number | null },
): FundStorage[] => {
  const ok = storages.filter((s) => s.active && !/待清償/.test(s.name));
  const grouped = !!account && (account.kind === 'group' || account.kind === 'special');
  return ok.filter((s) =>
    s.name === '郵局' || s.name === '現金' ||
    (grouped && (s.name.startsWith('現金（') || s.id === account!.default_storage_id)));
};
