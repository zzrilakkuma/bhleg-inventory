// 公基金帳本：型別、文字格式規則、餘額計算

export interface FundMember {
  id: number;
  nickname: string;
  real_name: string | null;
  role: '巢穴人' | '巢穴眾' | '外家代表' | null;
  default_last5: string | null;
  active: boolean;
  sort_order: number;
}

export interface FundHandler { id: number; name: string; active: boolean; sort_order: number }
export interface FundStorage { id: number; name: string; active: boolean; sort_order: number }
export interface FundAccount {
  id: number;
  name: string;
  kind: 'main' | 'reserve' | 'group' | 'special';
  default_storage_id: number | null;
  active: boolean;
  sort_order: number;
}

export type FundTransactionType =
  | 'donation' | 'income' | 'expense' | 'loan' | 'repayment' | 'refund'
  | 'transfer' | 'settlement' | 'opening' | 'group_summary' | 'reset';

export const TYPE_LABEL: Record<FundTransactionType, string> = {
  donation: '收入', income: '收入', expense: '支出', loan: '借款', repayment: '還款',
  refund: '回注', transfer: '轉帳', settlement: '結算', opening: '初始金額',
  group_summary: '小組彙整', reset: '歸零清算',
};

export interface FundLine {
  id: number;
  transaction_id: number;
  account_id: number;
  storage_id: number;
  amount: number;
  label: string | null;
}

export interface FundTransaction {
  id: number;
  type: FundTransactionType;
  occurred_on: string;
  seq: number;
  title: string;
  voucher: string | null;
  note: string | null;
  comment: string | null;
  amount: number;
  source: 'form' | 'admin' | 'import';
  created_at: string;
  fund_lines?: FundLine[];
}

export interface FundDonation {
  id: number;
  transaction_id: number;
  member_id: number;
  payer_member_id: number | null;
  payment_method: 'transfer' | 'cash';
  last5: string | null;
  handler_id: number | null;
  months: string[];
  message: string | null;
  submitted_at: string;
}

export const STANDARD_AMOUNT = 1500;
export const MONTHLY_CAP = 5000; // 章程：單月挹注上限，超過只提醒不擋

// ---- 月份 ----

/** 'YYYY-MM' → '9月' */
export const monthLabel = (ym: string) => `${parseInt(ym.slice(5), 10)}月`;

/** ['2026-08','2026-09'] → '8月+9月' */
export const monthsLabel = (months: string[]) =>
  [...months].sort().map(monthLabel).join('+');

/** 最近 n 個月（含本月），舊到新 */
export const recentMonths = (n: number, from = new Date()): string[] => {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---- 總表文字格式 ----

export const memberDisplayName = (m: Pick<FundMember, 'nickname' | 'real_name' | 'role'>) =>
  `${m.role ?? ''} ${m.nickname}${m.real_name ? `（${m.real_name}）` : ''}`.trim();

export interface DonationTextInput {
  member: Pick<FundMember, 'nickname' | 'real_name' | 'role'>;
  payer?: Pick<FundMember, 'nickname'> | null;
  months: string[];
  paymentMethod: 'transfer' | 'cash';
  last5?: string | null;
  handlerName?: string | null;
}

/** 依討論整理的規則產生 品項說明／憑證／備註 */
export const buildDonationTexts = (i: DonationTextInput) => {
  const titleLines = [`${memberDisplayName(i.member)} 奉納`];
  if (i.months.length) titleLines.push(`${monthsLabel(i.months)} 奉納金`);
  if (i.payer) titleLines.push(`（${i.payer.nickname}代繳）`);

  const voucherLines = ['#已回填每月奉納紀錄'];
  if (i.paymentMethod === 'transfer') voucherLines.push(`#匯款帳號末五碼${i.last5 ?? ''}`);
  else voucherLines.push(`#於巢穴由${i.handlerName ?? ''}經手`);

  const noteLines = [
    '#巢穴共同體成員奉納',
    `#${i.member.nickname} ${i.paymentMethod === 'transfer' ? '#匯入 #存放郵局' : '#現金 #存放現金袋'}`,
  ];

  return { title: titleLines.join('\n'), voucher: voucherLines.join('\n'), note: noteLines.join('\n') };
};

// ---- 餘額計算 ----

export interface BalanceSnapshot {
  accounts: Record<number, number>;
  storages: Record<number, number>;
  total: number;
}

const emptySnapshot = (): BalanceSnapshot => ({ accounts: {}, storages: {}, total: 0 });

/** 依時間順序把每筆明細加總，回傳每筆交易後的餘額快照（key = transaction id） */
export const computeRunningBalances = (transactions: FundTransaction[]) => {
  const ordered = [...transactions].sort(
    (a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.seq - b.seq || a.id - b.id,
  );
  const snapshots = new Map<number, BalanceSnapshot>();
  const cur = emptySnapshot();
  for (const tx of ordered) {
    for (const l of tx.fund_lines ?? []) {
      cur.accounts[l.account_id] = (cur.accounts[l.account_id] ?? 0) + Number(l.amount);
      cur.storages[l.storage_id] = (cur.storages[l.storage_id] ?? 0) + Number(l.amount);
      cur.total += Number(l.amount);
    }
    snapshots.set(tx.id, { accounts: { ...cur.accounts }, storages: { ...cur.storages }, total: cur.total });
  }
  return { ordered, snapshots, latest: snapshots.get(ordered[ordered.length - 1]?.id) ?? emptySnapshot() };
};

/** 轉成總表「結算」欄的文字 */
export const formatSnapshot = (s: BalanceSnapshot, accounts: FundAccount[], storages: FundStorage[]) => {
  const acc = accounts
    .filter((a) => a.active || (s.accounts[a.id] ?? 0) !== 0)
    .map((a) => `${a.name}：${s.accounts[a.id] ?? 0}`);
  const sto = storages
    .filter((st) => st.active || (s.storages[st.id] ?? 0) !== 0)
    .map((st) => `${st.name}：${s.storages[st.id] ?? 0}`);
  return [...acc, '————————', ...sto, `小結：${s.total}`].join('\n');
};

export const fmtAmount = (n: number) => (n < 0 ? `-${Math.abs(n).toLocaleString()}` : n.toLocaleString());
