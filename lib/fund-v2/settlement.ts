// 算 — 四步結算精靈：純函式（請款、還款、凍存、結算寫入、期別、延後天數、公布文字）。
import {
  buildRepaymentTexts, buildSettlementTexts, formatSnapshot, monthLabel, storageOutTag,
  type FundStorage,
} from '../fund.ts';
import type { NewTransaction, NewLine } from '../fund-db.ts';
import { dayInMonth, type FundSettings } from './settings.ts';
import type { Refs, Snapshot, UnclaimedExpense, OutstandingLoan, FundPeriod } from './api.ts';

type R = Pick<Refs, 'accounts' | 'storages'>;
type Sub = { table: string; row: Record<string, unknown> };

const mainOf = (refs: R) => {
  const m = refs.accounts.find((a) => a.kind === 'main');
  if (!m) throw new Error('找不到主科目');
  return m;
};
const storageNamed = (refs: R, name: string) => {
  const s = refs.storages.find((x) => x.name === name);
  if (!s) throw new Error(`找不到存放位置「${name}」`);
  return s;
};

/** 一筆代墊請款：每筆代墊一條 main/storage 明細。沒選任何代墊 → null。 */
export const buildClaimWrites = (
  selected: UnclaimedExpense[], date: string, storage: FundStorage, refs: R, seq?: number,
): { tx: NewTransaction; lines: NewLine[]; claimedExpenseIds: number[] } | null => {
  if (!selected.length) return null;
  const main = mainOf(refs);
  const lines: NewLine[] = selected.map((e) => ({
    account_id: main.id, storage_id: storage.id, amount: -Math.abs(e.amount),
    label: e.vendor ?? e.title.split('\n')[0],
  }));
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  const note = ['#代墊請款', ...lines.map((l) => `#${l.label} ${-l.amount}元`), storageOutTag(storage.name)].join('\n');
  return {
    tx: { type: 'expense_claim', occurred_on: date, seq, title: `代墊請款（${selected.length} 筆）`, voucher: '#', note, amount: sum },
    lines,
    claimedExpenseIds: selected.map((e) => e.transaction_id),
  };
};

export interface RepaymentInput { loan: OutstandingLoan; amount: number; fee: number }

/** 每筆 amount > 0 的還款一筆 repayment 交易；seq 從 seqStart 遞增。 */
export const buildRepaymentWrites = (
  items: RepaymentInput[], date: string, storage: FundStorage, refs: R, seqStart?: number,
): { tx: NewTransaction; lines: NewLine[]; sub: Sub; loan: OutstandingLoan; amount: number; fee: number }[] => {
  const main = mainOf(refs);
  return items.filter((i) => i.amount > 0).map((i, k) => {
    const out = i.amount + i.fee;
    const t = buildRepaymentTexts({ lender: i.loan.lender_name, storageName: storage.name, fee: i.fee });
    return {
      tx: { type: 'repayment', occurred_on: date, seq: seqStart == null ? undefined : seqStart + k, ...t, amount: -out },
      lines: [{ account_id: main.id, storage_id: storage.id, amount: -out }],
      sub: { table: 'fund_repayments', row: { loan_id: i.loan.loan_id, amount: i.amount, fee: i.fee } },
      loan: i.loan, amount: i.amount, fee: i.fee,
    };
  });
};

/** 第 1 步對不凍結零用金（也是小結）的影響。 */
export const step1Delta = (expenses: UnclaimedExpense[], repayments: { amount: number; fee: number }[]) =>
  -expenses.reduce((s, e) => s + Math.abs(e.amount), 0)
  - repayments.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount + r.fee, 0);

/** 凍存：floor(base × rate) 各一筆；base ≤ 0 → 0/0。base 預設為不凍結零用金。 */
export const computeFreeze = (mainAfterClaims: number, settings: FundSettings, total?: number) => {
  const rate = settings.freeze_rate;
  const base = settings.freeze_base === 'total' && total != null ? total : mainAfterClaims;
  const n = base > 0 && rate > 0 ? Math.floor(base * rate) : 0;
  return { base, reserve: n, future: n };
};

/** 同月第幾次結算 */
export const nextPeriod = (periods: Pick<FundPeriod, 'month'>[], month: string) =>
  1 + periods.filter((p) => p.month === month).length;

const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
/** max(0, 結算日 − <month>-<dueDay>)；該月沒有那一天則以月底計 */
export const lateDays = (month: string, date: string, dueDay: number) =>
  Math.max(0, Math.round((utc(date) - utc(`${month}-${String(dayInMonth(month, dueDay)).padStart(2, '0')}`)) / 86400000));

/** 把明細套到快照上（預覽用）。 */
export const applyLines = (s: Snapshot, lines: NewLine[], refs: R): Snapshot => {
  const main = mainOf(refs);
  const accounts = { ...s.accounts }; const storages = { ...s.storages };
  let total = s.total;
  for (const l of lines) {
    accounts[l.account_id] = (accounts[l.account_id] ?? 0) + l.amount;
    storages[l.storage_id] = (storages[l.storage_id] ?? 0) + l.amount;
    total += l.amount;
  }
  return { ...s, accounts, storages, total, main: accounts[main.id] ?? 0 };
};

const reserveAccounts = (refs: R) => {
  const rs = refs.accounts.filter((a) => a.kind === 'reserve');
  const emerg = rs.find((a) => a.name.includes('緊急')) ?? rs[0];
  const future = rs.find((a) => a.name.includes('前瞻')) ?? rs.find((a) => a !== emerg);
  if (!emerg || !future) throw new Error('找不到緊急應變／共存前瞻科目');
  return { emerg, future };
};

export interface SettlementInput {
  month: string; periodNo: number; date: string; seq?: number;
  freeze: { base: number; reserve: number; future: number };
  zeroReason?: string;
  /** 第 1 步寫入後的不凍結零用金 */
  mainBefore: number;
  system: { post: number; cash: number };
  actual: { post: number; cash: number };
  repayments: { lender: string; amount: number; fee: number; remaining: number }[];
  refs: R; settings: FundSettings;
}

/** 凍存 ＋ 矯正回歸 的明細（不含驗證）。 */
export const settlementLines = (i: Pick<SettlementInput, 'freeze' | 'system' | 'actual' | 'refs'>): NewLine[] => {
  const main = mainOf(i.refs);
  const post = storageNamed(i.refs, '郵局');
  const cash = storageNamed(i.refs, '現金');
  const { emerg, future } = reserveAccounts(i.refs);
  const lines: NewLine[] = [];
  for (const [acc, n] of [[emerg.id, i.freeze.reserve], [future.id, i.freeze.future]] as const) {
    if (n > 0) {
      lines.push({ account_id: main.id, storage_id: post.id, amount: -n, label: '凍存' });
      lines.push({ account_id: acc, storage_id: post.id, amount: n, label: '凍存' });
    }
  }
  for (const [sid, d] of [[post.id, i.actual.post - i.system.post], [cash.id, i.actual.cash - i.system.cash]] as const) {
    if (d !== 0) lines.push({ account_id: main.id, storage_id: sid, amount: d, label: '矯正回歸' });
  }
  return lines;
};

export const DEFAULT_ZERO_REASON = '因餘款不足';

export const buildSettlementWrite = (i: SettlementInput): { tx: NewTransaction; lines: NewLine[]; sub: Sub; leftover: number } => {
  const frozen = i.freeze.reserve > 0 || i.freeze.future > 0;
  const reason = i.zeroReason?.trim() ?? '';
  if (!frozen && !reason) throw new Error('這次不凍存，請填原因');
  if (i.freeze.reserve < 0 || i.freeze.future < 0) throw new Error('凍存金額不可為負');
  const lines = settlementLines(i);
  const main = mainOf(i.refs);
  const leftover = i.mainBefore + lines.filter((l) => l.account_id === main.id).reduce((s, l) => s + l.amount, 0);
  const t = buildSettlementTexts({
    month: i.month, remaining: i.freeze.base, freezeReserve: i.freeze.reserve, freezeFuture: i.freeze.future,
    repayments: i.repayments, leftover,
    extraNote: !frozen && reason !== DEFAULT_ZERO_REASON ? `#${reason}` : '',
  });
  const dueDay = i.settings.settlement_due_day;
  return {
    tx: { type: 'settlement', occurred_on: i.date, seq: i.seq, ...t, amount: 0, comment: null },
    lines,
    sub: {
      table: 'fund_settlements',
      row: {
        month: i.month, period_no: i.periodNo, freeze_base: i.freeze.base,
        frozen_reserve: i.freeze.reserve, frozen_future: i.freeze.future, zero_reason: frozen ? null : reason,
        system_post: i.system.post, system_cash: i.system.cash, actual_post: i.actual.post, actual_cash: i.actual.cash,
        late_days: lateDays(i.month, i.date, dueDay),
      },
    },
    leftover,
  };
};

const slashDate = (iso: string) => iso.split('-').map(Number).join('/');

/** 群組公布文字：「***N月結算***」、日期、快照（與總表結算欄同格式）。 */
export const publishText = (after: Snapshot, refs: R, month: string, date: string) =>
  [`***${monthLabel(month)}結算***`, slashDate(date), formatSnapshot(after, refs.accounts, refs.storages)].join('\n');
