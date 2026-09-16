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

// ================= 第二階段 =================

export interface FundAdvancer { id: number; name: string; active: boolean; sort_order: number }
export interface FundTag { id: number; name: string; group: 'space' | 'nature' | 'item'; active: boolean; sort_order: number }
export const TAG_GROUP_LABEL: Record<FundTag['group'], string> = { space: '空間', nature: '性質', item: '細項' };

export interface FundExpense {
  id: number; transaction_id: number; vendor: string | null; description: string | null;
  voucher_no: string | null; tags: string[]; advancer_id: number | null; settled: boolean;
}
export interface FundLoan { id: number; transaction_id: number; lender_name: string; principal: number; note: string | null }
export interface FundRepayment { id: number; transaction_id: number; loan_id: number; amount: number; fee: number }
export interface FundSettlement {
  id: number; transaction_id: number; month: string;
  actual_post: number | null; actual_cash: number | null; system_post: number | null; system_cash: number | null;
}

export const FREEZE_RATE = 0.3; // 章程：結算後總餘款 30% 凍存緊急應變備用金、30% 凍存共存前瞻預算

export const storageOutTag = (storageName: string) =>
  storageName === '郵局' ? '#郵局支出' : storageName.startsWith('現金') ? '#現金支出' : `#${storageName}支出`;
export const storageInTag = (storageName: string) =>
  storageName === '郵局' ? '#存放郵局' : storageName === '現金' ? '#存放現金袋' : `#存放${storageName}`;

/** 支出 */
export const buildExpenseTexts = (i: {
  vendor: string; description: string; voucherNo: string; tags: string[];
  storageName: string; accountName: string; advancerName?: string | null;
}) => {
  const title = [i.vendor ? `【${i.vendor}】` : '', i.description].filter(Boolean).join('\n');
  const voucher = i.voucherNo ? (/^[A-Z]{2}-?\d{8}$/i.test(i.voucherNo) ? `#電子發票證明聯\n${i.voucherNo}` : `#${i.voucherNo}`) : '#無憑證';
  const noteLines = ['#巢穴共同體經常性基本開銷'];
  if (i.tags.length) noteLines.push(i.tags.map((t) => `#${t}`).join(' '));
  if (i.advancerName) noteLines.push(`#${i.advancerName}代墊 #待清償`);
  else noteLines.push(storageOutTag(i.storageName));
  if (i.accountName !== '不凍結零用金') noteLines.push(`#「${i.accountName}」支付`);
  return { title, voucher, note: noteLines.join('\n') };
};

/** 清償代墊 */
export const buildAdvanceSettleTexts = (i: { advancerName: string; storageName: string; amount: number }) => ({
  title: `清償 ${i.advancerName} 代墊款`,
  voucher: '#',
  note: `#清償代墊 #${i.advancerName}\n#「${i.storageName}」轉入「代墊（待清償）」${i.amount}元`,
});

/** 借款 */
export const buildLoanTexts = (i: { lender: string; storageName: string }) => ({
  title: `${i.lender} 借款\n***巢穴緊急紓困借款***`,
  voucher: '#',
  note: `#巢穴緊急紓困借款\n#${i.lender} ${storageInTag(i.storageName)}`,
});

/** 還款 */
export const buildRepaymentTexts = (i: { lender: string; storageName: string; fee: number }) => ({
  title: `共同體共同債務\n償還${i.lender}所提供的紓困借貸`,
  voucher: '#',
  note: `#巢穴共同體經常性基本開銷\n#巢穴 #共同債務 #紓困借貸\n#${i.lender} ${storageOutTag(i.storageName)}${i.fee ? `\n#手續費${i.fee}元` : ''}`,
});

/** 轉帳 */
export const buildTransferTexts = (i: { fromName: string; toName: string; amount: number }) => ({
  title: `【轉帳】${i.fromName} → ${i.toName}`,
  voucher: '#',
  note: `#「${i.fromName}」轉入「${i.toName}」${i.amount}元`,
});

/** 回注／其他收入 */
export const buildOtherIncomeTexts = (i: { source: string; description: string; storageName: string; accountName: string; refund: boolean }) => ({
  title: [i.source, i.description].filter(Boolean).join('\n'),
  voucher: '#',
  note: `${i.refund ? '#餘款回注' : '#其他收入'} #${i.source}\n${storageInTag(i.storageName)}${i.accountName !== '不凍結零用金' ? `\n#進「${i.accountName}」` : ''}`,
});

/** 月結算：依總表備註格式 */
export const buildSettlementTexts = (i: {
  month: string; remaining: number; freezeReserve: number; freezeFuture: number;
  repayments: { lender: string; amount: number; fee: number; remaining: number }[];
  leftover: number; extraNote: string;
}) => {
  const m = monthLabel(i.month);
  const lines = [`#不凍結零用金剩餘：${i.remaining}`];
  if (i.freezeReserve || i.freezeFuture) lines.push(`#${i.remaining}*${FREEZE_RATE * 100}%=${Math.floor(i.remaining * FREEZE_RATE)}`);
  else lines.push('#因餘款不足');
  lines.push(`#不凍結零用金${i.freezeReserve}元以「緊急應變備用金」凍存`);
  lines.push(`#不凍結零用金${i.freezeFuture}元以「共存前瞻預算」凍存`);
  if (i.repayments.length) {
    lines.push('');
    for (const r of i.repayments) {
      lines.push(`#不凍結零用金${r.amount}元用以償還${r.fee ? `（${r.fee}元手續費）` : ''}`);
      lines.push(`${r.lender}所提供之「巢穴緊急紓困借款」`);
    }
    lines.push('');
    for (const r of i.repayments) lines.push(`${r.lender}借款 剩餘${r.remaining}元 尚待償還`);
  }
  lines.push(`#不凍結零用金預留${i.leftover}元`);
  if (i.extraNote.trim()) lines.push('', i.extraNote.trim());
  return { title: `***${m}結算***`, voucher: '#郵局帳戶\n#現金袋', note: lines.join('\n') };
};

/** 借款剩餘 */
export const loanRemaining = (loan: FundLoan, repayments: FundRepayment[]) =>
  Number(loan.principal) - repayments.filter((r) => r.loan_id === loan.id).reduce((s, r) => s + Number(r.amount), 0);
